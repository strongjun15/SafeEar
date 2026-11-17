// esbuild로 main / preload / 엔진 / 화면을 dist/에 묶는다.
//   node scripts/build.mjs           개발 빌드
//   node scripts/build.mjs --prod    배포 빌드 (압축)
//   node scripts/build.mjs --watch   파일이 바뀌면 다시 빌드
import { build, context } from 'esbuild';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const prod = process.argv.includes('--prod');
const watch = process.argv.includes('--watch');

// .env (없으면 빈 값 → 로그인 없이 이 PC 안에서만 동작)
const env = {};
const envPath = join(root, '.env');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    // 텍스트 편집기가 바꿔 넣는 둥근 따옴표(“ ” ‘ ’)까지 벗긴다
    if (!m || line.trim().startsWith('#')) continue;
    const v = m[2].replace(/^["'“”‘’]+|["'“”‘’]+$/g, '').trim();
    if (v || !(m[1] in env)) env[m[1]] = v; // 같은 이름이 또 있으면 빈 값으로 덮어쓰지 않는다
  }
}
// 대시보드에서 복사할 때 딸려 오는 /rest/v1 · /auth/v1 · 끝의 / 를 떼어 낸다
if (env.SAFEEAR_SUPABASE_URL) env.SAFEEAR_SUPABASE_URL = env.SAFEEAR_SUPABASE_URL.replace(/\/(rest|auth)\/v1\/?$/, '').replace(/\/+$/, '');
const url = env.SAFEEAR_SUPABASE_URL ?? '', key = env.SAFEEAR_SUPABASE_ANON_KEY ?? '';
if (/^sb_secret_|service_role/.test(key)) {
  console.error('\n[build] ✖ .env에 secret 키를 넣었어요. 앱에는 Publishable key(sb_publishable_…)를 넣어야 해요.\n');
  process.exit(1);
}
if (url && !/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url)) console.warn(`[build] ⚠ 서버 주소 모양이 이상해요: ${url} (https://xxxx.supabase.co 형태여야 해요)`);
if (url && key) console.log(`\n[build] ✔ 로그인 켜짐 — 서버 ${url} · 키 ${key.slice(0, 18)}…\n`);
else console.warn(`\n[build] ⚠ 로그인 꺼짐 — .env(${envPath})에 ${!url ? 'SAFEEAR_SUPABASE_URL' : ''}${!url && !key ? ', ' : ''}${!key ? 'SAFEEAR_SUPABASE_ANON_KEY' : ''} 값이 없어요.\n`);

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

const common = { bundle: true, sourcemap: !prod, minify: prod, logLevel: 'info', target: 'es2022' };
const jobs = [
  {
    ...common,
    entryPoints: [join(root, 'src/main/main.ts')],
    outfile: join(dist, 'main.cjs'),
    platform: 'node',
    format: 'cjs',
    external: ['electron'],
    define: {
      __SUPABASE_URL__: JSON.stringify(env.SAFEEAR_SUPABASE_URL ?? ''),
      __SUPABASE_ANON_KEY__: JSON.stringify(env.SAFEEAR_SUPABASE_ANON_KEY ?? ''),
      __AUTH_CALLBACK_PORT__: JSON.stringify(env.SAFEEAR_AUTH_PORT ?? '51789'),
    },
  },
  ...['ui', 'engine'].map((name) => ({
    ...common,
    entryPoints: [join(root, `src/preload/${name}.ts`)],
    outfile: join(dist, `preload-${name}.cjs`),
    platform: 'node',
    format: 'cjs',
    external: ['electron'],
  })),
  {
    ...common,
    entryPoints: [join(root, 'src/engine/engine.ts')],
    outfile: join(dist, 'engine/engine.js'),
    platform: 'browser',
    format: 'iife',
    loader: { '.worklet.js': 'text' },
  },
  {
    ...common,
    entryPoints: [join(root, 'src/ui/app.ts')],
    outfile: join(dist, 'ui/app.js'),
    platform: 'browser',
    format: 'iife',
  },
];

function copyStatic() {
  cpSync(join(root, 'src/engine/engine.html'), join(dist, 'engine/engine.html'));
  cpSync(join(root, 'src/ui/index.html'), join(dist, 'ui/index.html'));
  cpSync(join(root, 'src/ui/styles.css'), join(dist, 'ui/styles.css'));
  mkdirSync(join(dist, 'assets'), { recursive: true });
  const icons = ['icon.png', 'tray.png', 'tray-paused.png'];
  for (const t of ['tray-macTemplate', 'tray-mac-pausedTemplate']) icons.push(`${t}.png`, `${t}@2x.png`);
  for (const f of icons) {
    if (existsSync(join(root, 'build', f))) cpSync(join(root, 'build', f), join(dist, 'assets', f));
  }
}

if (watch) {
  for (const j of jobs) await (await context(j)).watch();
  copyStatic();
  console.log('[build] watching… (html/css를 바꾸면 다시 실행하세요)');
} else {
  await Promise.all(jobs.map((j) => build(j)));
  copyStatic();
}

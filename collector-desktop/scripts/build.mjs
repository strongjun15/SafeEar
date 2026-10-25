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
    if (m && !line.trim().startsWith('#')) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
if (!env.SAFEEAR_SUPABASE_URL) console.warn('[build] .env에 SAFEEAR_SUPABASE_URL이 없어요 — 로그인 기능 없이 빌드합니다.');

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

const common = { bundle: true, loader: { '.png': 'dataurl' }, sourcemap: !prod, minify: prod, logLevel: 'info', target: 'es2022' };
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
  for (const f of ['icon.png', 'tray.png', 'tray-paused.png']) {
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

// 브라우저 미리보기 (윈도우 없이 화면 확인용): node scripts/build-preview.mjs → dist/preview.html
// 실제 화면 코드(src/ui) + 가짜 데이터(src/preview/mock-api.ts)를 HTML 파일 하나로 묶는다.
import { build } from 'esbuild';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const res = await build({
  entryPoints: [join(root, 'src/preview/preview.ts')],
  bundle: true,
  minify: true,
  write: false,
  format: 'iife',
  platform: 'browser',
  target: 'es2022',
});
const js = res.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const css = readFileSync(join(root, 'src/ui/styles.css'), 'utf8');
let html = readFileSync(join(root, 'src/ui/index.html'), 'utf8')
  .replace(/<meta http-equiv="Content-Security-Policy"[^>]*>\n?/, '')
  .replace('<link rel="stylesheet" href="styles.css">', () => `<style>\n${css}\n</style>`)
  .replace('<script src="app.js"></script>', () => `<script>\n${js}\n</script>`)
  .replace('<title>SafeEar</title>', '<title>SafeEar 미리보기</title>')
  .replace(
    '로그인 없이도 이 PC 안에서 모든 기능을 쓸 수 있어요. 소리는 어디에도 저장하거나 보내지 않아요.',
    '미리보기예요. 로그인과 데이터는 모두 가짜이고, 어떤 정보도 보내지 않아요.',
  );
mkdirSync(join(root, 'dist'), { recursive: true });
writeFileSync(join(root, 'dist/preview.html'), html);
console.log('wrote dist/preview.html', (html.length / 1024).toFixed(0) + 'KB');

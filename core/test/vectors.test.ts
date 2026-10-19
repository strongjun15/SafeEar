/** 골든 테스트 벡터 회귀 검사 — WAV를 다시 분석해 expected.json과 비교 (V8의 TS 기준 구현 쪽) */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { analyzeFrame } from '../src/index.ts';
import { expect } from './expect.ts';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'test-vectors');
const expectedPath = join(dir, 'expected.json');

function readWav16(path: string) {
  const b = readFileSync(path);
  const sr = b.readUInt32LE(24);
  const n = b.readUInt32LE(40) / 2;
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = b.readInt16LE(44 + i * 2) / 32767;
  return { sr, x };
}

const close = (a: number, b: number, rel: number) => Math.abs(a - b) <= rel * Math.max(Math.abs(a), Math.abs(b), 1e-30);

describe('골든 테스트 벡터', { skip: !existsSync(expectedPath) }, () => {
  const exp = existsSync(expectedPath) ? JSON.parse(readFileSync(expectedPath, 'utf8')) : { vectors: {} };
  for (const [name, v] of Object.entries<any>(exp.vectors)) {
    it(name, () => {
      const { sr, x } = readWav16(join(dir, v.file));
      const f = analyzeFrame([x], sr);
      const rel = exp.tolerance.relative;
      expect(close(f.msZ, v.msZ, rel)).toBe(true);
      expect(close(f.msA, v.msA, rel)).toBe(true);
      if (v.betaFrame === null) expect(f.betaFrame).toBeNull();
      else expect(close(f.betaFrame!, v.betaFrame, rel)).toBe(true);
      f.bandMsA.forEach((b, i) => expect(close(b, v.bandMsA[i], 1e-5) || v.bandMsA[i] < 1e-12).toBe(true));
    });
  }
});

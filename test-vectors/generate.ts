/**
 * 골든 테스트 벡터 생성기 (계획서 16.2절).
 *
 *   npm run vectors   (루트에서)  →  test-vectors/wav/*.wav + test-vectors/expected.json
 *
 * WAV는 16비트 PCM으로 저장하고, 기대값은 저장된 WAV를 다시 읽어 계산한다.
 * 안드로이드(Kotlin)·iOS(Swift) 구현은 같은 WAV를 넣어 expected.json과 허용오차 안에서 일치해야 한다 (V8).
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzeFrame, kurtosisWeight, msToDbfs } from '../core/src/index.ts';
import { SR, impulseTrain, pinkNoise, sine, whiteNoise } from '../core/test/signals.ts';

const here = dirname(fileURLToPath(import.meta.url));
const wavDir = join(here, 'wav');
mkdirSync(wavDir, { recursive: true });

export function writeWav16(path: string, x: Float32Array, sr: number): void {
  const buf = Buffer.alloc(44 + x.length * 2);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + x.length * 2, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sr, 24);
  buf.writeUInt32LE(sr * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(x.length * 2, 40);
  for (let i = 0; i < x.length; i++) buf.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(x[i] * 32767))), 44 + i * 2);
  writeFileSync(path, buf);
}

export function readWav16(path: string): { sr: number; x: Float32Array } {
  const b = readFileSync(path);
  const sr = b.readUInt32LE(24);
  const n = b.readUInt32LE(40) / 2;
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = b.readInt16LE(44 + i * 2) / 32767;
  return { sr, x };
}

const vectors: Record<string, { signal: Float32Array; expect: string }> = {
  'sine_1k_-9dBFS': { signal: sine(1000, 0.5), expect: 'β ≈ 1.5, 1k 대역에 에너지 집중' },
  'sine_1k_-15dBFS': { signal: sine(1000, 0.25), expect: '위보다 6.02 dB 낮음 (레벨 비례)' },
  'sine_100_-9dBFS': { signal: sine(100, 0.5), expect: 'A-가중으로 약 19.1 dB 감쇠' },
  white_gaussian: { signal: whiteNoise(0.1, 1, 1), expect: 'β ≈ 3 → 첨도 보정 배율 1 (V3)' },
  impulse_train: { signal: impulseTrain(1, 3), expect: 'β ≫ 3 → 배율 > 1' },
  pink_noise: { signal: pinkNoise(0.1, 1, 2), expect: '1/3 옥타브 대역 에너지가 거의 고르게' },
  silence: { signal: new Float32Array(SR), expect: '모든 값 0' },
};

const out: Record<string, unknown> = {};
for (const [name, v] of Object.entries(vectors)) {
  const file = join(wavDir, `${name}.wav`);
  writeWav16(file, v.signal, SR);
  const { sr, x } = readWav16(file);
  const f = analyzeFrame([x], sr);
  out[name] = {
    file: `wav/${name}.wav`,
    expect: v.expect,
    msZ: f.msZ,
    msA: f.msA,
    dbfsZ: msToDbfs(f.msZ),
    dbfsA: msToDbfs(f.msA),
    betaFrame: f.betaFrame,
    kurtosisWeight: kurtosisWeight(f.betaFrame),
    bandMsA: f.bandMsA,
  };
}
writeFileSync(
  join(here, 'expected.json'),
  JSON.stringify({ generatedBy: 'core (TypeScript)', sampleRate: SR, tolerance: { relative: 1e-6, dbfs: 0.01 }, vectors: out }, null, 2) + '\n',
);
console.log(`wrote ${Object.keys(out).length} vectors to ${here}`);

/** 테스트용 결정론적 신호 생성기 (시드 고정) — test-vectors/generate.ts와 같은 정의 */

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function gaussian(rand: () => number): () => number {
  let spare: number | null = null;
  return () => {
    if (spare !== null) {
      const s = spare;
      spare = null;
      return s;
    }
    let u = 0;
    while (u === 0) u = rand();
    const v = rand();
    const r = Math.sqrt(-2 * Math.log(u));
    spare = r * Math.sin(2 * Math.PI * v);
    return r * Math.cos(2 * Math.PI * v);
  };
}

export const SR = 48000;

export function sine(freq: number, amp: number, seconds = 1, sr = SR): Float32Array {
  const n = Math.round(seconds * sr);
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = amp * Math.sin((2 * Math.PI * freq * i) / sr);
  return x;
}

export function whiteNoise(rms: number, seconds = 1, seed = 1, sr = SR): Float32Array {
  const g = gaussian(mulberry32(seed));
  const n = Math.round(seconds * sr);
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = rms * g();
  return x;
}

/** Paul Kellet 정밀 핑크 노이즈 필터 */
export function pinkNoise(rms: number, seconds = 1, seed = 2, sr = SR): Float32Array {
  const g = gaussian(mulberry32(seed));
  const n = Math.round(seconds * sr);
  const x = new Float32Array(n);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  let ss = 0;
  for (let i = 0; i < n; i++) {
    const w = g();
    b0 = 0.99886 * b0 + w * 0.0555179;
    b1 = 0.99332 * b1 + w * 0.0750759;
    b2 = 0.969 * b2 + w * 0.153852;
    b3 = 0.8665 * b3 + w * 0.3104856;
    b4 = 0.55 * b4 + w * 0.5329522;
    b5 = -0.7616 * b5 - w * 0.016898;
    const v = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362;
    b6 = w * 0.115926;
    x[i] = v;
    ss += v * v;
  }
  const k = rms / Math.sqrt(ss / n);
  for (let i = 0; i < n; i++) x[i] *= k;
  return x;
}

/** 총소리 흉내: 낮은 잡음 위에 짧은 임펄스가 주기적으로 */
export function impulseTrain(seconds = 1, seed = 3, sr = SR): Float32Array {
  const g = gaussian(mulberry32(seed));
  const n = Math.round(seconds * sr);
  const x = new Float32Array(n);
  const period = Math.round(sr * 0.25);
  for (let i = 0; i < n; i++) {
    const ph = i % period;
    const burst = ph < 240 ? 0.8 * Math.exp(-ph / 40) : 0;
    x[i] = 0.01 * g() + burst * g();
  }
  return x;
}

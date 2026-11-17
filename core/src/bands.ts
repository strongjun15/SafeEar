/**
 * 1/3 옥타브 19개 대역 (125 Hz ~ 8 kHz). 계획서 3.3절, 6.1절(코코 껍데기 19밴드).
 * 중심 주파수는 IEC 61260 base-10 정의: fc = 1000 · G^(n/3), G = 10^(3/10).
 */

export const BAND_COUNT = 19;

/** 표기용 공칭 중심 주파수 [Hz] */
export const BAND_NOMINAL_HZ = [
  125, 160, 200, 250, 315, 400, 500, 630, 800, 1000, 1250, 1600, 2000, 2500, 3150, 4000, 5000, 6300, 8000,
] as const;

export const BAND_LABELS = BAND_NOMINAL_HZ.map((f) =>
  f >= 1000 ? `${+(f / 1000).toFixed(2)}k` : String(f),
);

const G = Math.pow(10, 0.3);

/** 정확한 중심 주파수 [Hz] */
export const BAND_CENTER_HZ = Array.from({ length: BAND_COUNT }, (_, i) => 1000 * Math.pow(G, (i - 9) / 3));

/** 대역 경계 [lo, hi) [Hz] */
export const BAND_EDGES_HZ: ReadonlyArray<readonly [number, number]> = BAND_CENTER_HZ.map(
  (fc) => [fc * Math.pow(G, -1 / 6), fc * Math.pow(G, 1 / 6)] as const,
);

/** 3~6 kHz 취약 대역 (3.15k ~ 6.3k) 인덱스 — 계획서 3.3절 */
export const VULNERABLE_BANDS = [14, 15, 16, 17] as const;

/** FFT bin → 대역 인덱스 (대역 밖이면 −1) */
export function binToBandMap(fftSize: number, sampleRate: number): Int8Array {
  const map = new Int8Array(fftSize / 2 + 1).fill(-1);
  for (let k = 1; k <= fftSize / 2; k++) {
    const f = (k * sampleRate) / fftSize;
    for (let b = 0; b < BAND_COUNT; b++) {
      const [lo, hi] = BAND_EDGES_HZ[b];
      if (f >= lo && f < hi) {
        map[k] = b;
        break;
      }
    }
  }
  return map;
}

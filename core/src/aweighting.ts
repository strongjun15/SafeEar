/**
 * A-가중 (IEC 61672-1). 계획서 3.1절 (가).
 * ISO 226 등청감곡선에서 유도된 곡선이며, 18~25세 기준이라는 한계가 있다(3.1절 한계 명시).
 */

const F1 = 20.598997;
const F2 = 107.65265;
const F3 = 737.86223;
const F4 = 12194.217;
/** 1 kHz에서 0 dB가 되도록 맞추는 상수 (≈ +2.00 dB) */
const A1000 = 1.9997;

/** A-가중 응답 [dB]. f = 0 이면 −Infinity */
export function aWeightingDb(f: number): number {
  if (f <= 0) return -Infinity;
  const f2 = f * f;
  const ra =
    (F4 * F4 * f2 * f2) /
    ((f2 + F1 * F1) * Math.sqrt((f2 + F2 * F2) * (f2 + F3 * F3)) * (f2 + F4 * F4));
  return 20 * Math.log10(ra) + A1000;
}

/** A-가중 파워 이득 (선형, |H(f)|²) */
export function aWeightingPower(f: number): number {
  if (f <= 0) return 0;
  return Math.pow(10, aWeightingDb(f) / 10);
}

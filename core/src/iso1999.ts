/**
 * ⑤ 장기 예측 — ISO 1999:2013 소음성 영구역치이동(NIPTS) 중앙값 N₅₀. 계획서 3.6절, 6.3절.
 *
 *   N₅₀ = [u + v·lg(Θ/Θ₀)] · (L_EX,8h − L₀)²          (Θ = 10~40년, L_EX,8h > L₀)
 *   N₅₀(Θ<10) = lg(Θ+1)/lg(11) · N₅₀(Θ=10)
 *
 * u, v, L₀는 주파수별 상수다 (연령·성별 항 없음 — 4.1절).
 * ⚠ ISO 1999는 성인 집단의 통계적 예측용이다. 청소년 개인에게 적용하는 것은 외삽이다 (4.1절, 6.3절 한계 명시).
 * ⚠ 아래 상수는 표준 원문 Table 1과 대조해 확인할 것 (계획서 8절 V7).
 */

export const ISO1999_FREQS = [500, 1000, 2000, 3000, 4000, 6000] as const;
export type Iso1999Freq = (typeof ISO1999_FREQS)[number];

const TABLE: Record<Iso1999Freq, { u: number; v: number; L0: number }> = {
  500: { u: -0.033, v: 0.11, L0: 93 },
  1000: { u: -0.02, v: 0.07, L0: 89 },
  2000: { u: -0.045, v: 0.066, L0: 80 },
  3000: { u: 0.012, v: 0.037, L0: 77 },
  4000: { u: 0.025, v: 0.025, L0: 75 },
  6000: { u: 0.019, v: 0.024, L0: 77 },
};

/** 주파수별 NIPTS 중앙값 [dB] */
export function nipts50(freq: Iso1999Freq, lex8h: number, years: number): number {
  const { u, v, L0 } = TABLE[freq];
  if (!(lex8h > L0) || years <= 0) return 0;
  const sq = (lex8h - L0) * (lex8h - L0);
  if (years < 10) return (Math.log10(years + 1) / Math.log10(11)) * (u + v) * sq;
  return Math.max(0, (u + v * Math.log10(years)) * sq);
}

export interface NiptsPoint {
  freq: Iso1999Freq;
  db: number;
}

export function niptsCurve(lex8h: number, years: number): NiptsPoint[] {
  return ISO1999_FREQS.map((freq) => ({ freq, db: nipts50(freq, lex8h, years) }));
}

/**
 * 첨도 β와 첨도 보정 배율. 계획서 3.1절 (나), 3.2절 검토 메모, 9절 #6·#7·#8.
 *
 * 구현에서 정한 것 (9절 미해결 항목에 대한 임시 결정 — docs/ARCHITECTURE.md에 정리):
 *  - #6 보정식: Goley·Zhang형 에너지 배율 w(β) = (β/3)^(λ/10), λ = 6.5 (Zhang 2022)
 *  - #7 창 길이: 문헌을 따라 40초 이동창 (소리가 있는 프레임만 모음). 1초 창 β도 따로 계산해 둔다
 *  - #8 β < 3: 배율 하한을 1로 고정 (문헌 근거가 β ≥ 3 영역)
 *  - (추가) β 상한 100: 합성 임펄스열은 β가 수백까지 나와 배율이 20배를 넘는다. 문헌이 다룬 범위를
 *    크게 벗어난 외삽이므로 상한을 둔다 — 임시값, 9절 미해결 항목에 추가할 것
 *  - β는 A-가중 전(무가중) 신호에서, 두 채널 표본을 한 모집단으로 합쳐 구한다
 */

/** 원점 기준 적률 합. 프레임끼리 더할 수 있어 이동창 계산이 간단하다. */
export interface Moments {
  n: number;
  s1: number;
  s2: number;
  s3: number;
  s4: number;
}

export const emptyMoments = (): Moments => ({ n: 0, s1: 0, s2: 0, s3: 0, s4: 0 });

export function addMomentsInto(into: Moments, m: Moments): Moments {
  into.n += m.n;
  into.s1 += m.s1;
  into.s2 += m.s2;
  into.s3 += m.s3;
  into.s4 += m.s4;
  return into;
}

export function accumulateMoments(into: Moments, x: ArrayLike<number>): Moments {
  let s1 = 0, s2 = 0, s3 = 0, s4 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = x[i];
    const v2 = v * v;
    s1 += v;
    s2 += v2;
    s3 += v2 * v;
    s4 += v2 * v2;
  }
  into.n += x.length;
  into.s1 += s1;
  into.s2 += s2;
  into.s3 += s3;
  into.s4 += s4;
  return into;
}

/** β = E[(x−μ)⁴] / σ⁴. 표본이 부족하거나 분산이 0이면 null */
export function betaFromMoments(m: Moments): number | null {
  if (m.n < 4) return null;
  const mu = m.s1 / m.n;
  const e2 = m.s2 / m.n;
  const e3 = m.s3 / m.n;
  const e4 = m.s4 / m.n;
  const variance = e2 - mu * mu;
  if (!(variance > 1e-20)) return null;
  const m4 = e4 - 4 * mu * e3 + 6 * mu * mu * e2 - 3 * mu * mu * mu * mu;
  const beta = m4 / (variance * variance);
  return Number.isFinite(beta) && beta > 0 ? beta : null;
}

export interface KurtosisConfig {
  /** 보정 계수 λ (Zhang 2022: 6.5) */
  lambda: number;
  /** β 이동창 길이 [초] */
  windowSeconds: number;
  /** β < 3일 때 배율을 1로 고정할지 */
  floorAtOne: boolean;
  /** 배율 계산에 쓰는 β 상한 */
  maxBeta: number;
  /** 이 값(평균제곱, FS²)보다 조용한 프레임은 창에 넣지 않는다. 1e-7 ≈ −70 dBFS */
  silenceMs: number;
  /** 창 안의 프레임이 이보다 오래되면 버린다 [초] — 긴 공백 뒤 옛 소리가 섞이지 않게 */
  maxAgeSeconds: number;
}

export const DEFAULT_KURTOSIS: KurtosisConfig = {
  lambda: 6.5,
  windowSeconds: 40,
  floorAtOne: true,
  maxBeta: 100,
  silenceMs: 1e-7,
  maxAgeSeconds: 300,
};

/** 첨도 보정 에너지 배율 w(β) = (β/3)^(λ/10). β = 3(가우시안)이면 1 — 보정이 자동으로 무효화된다 (V3) */
export function kurtosisWeight(
  beta: number | null,
  cfg: Pick<KurtosisConfig, 'lambda' | 'floorAtOne' | 'maxBeta'> = DEFAULT_KURTOSIS,
): number {
  if (beta == null || !Number.isFinite(beta) || beta <= 0) return 1;
  const w = Math.pow(Math.min(beta, cfg.maxBeta) / 3, cfg.lambda / 10);
  return cfg.floorAtOne ? Math.max(1, w) : w;
}

/** 소리가 있는 프레임만 모아 최근 N초 분량으로 β를 구한다 */
export class KurtosisWindow {
  private frames: { t: number; m: Moments }[] = [];
  private readonly cfg: KurtosisConfig;
  constructor(cfg: KurtosisConfig = DEFAULT_KURTOSIS) {
    this.cfg = cfg;
  }

  /** @param t 프레임 시각 [ms] */
  push(t: number, m: Moments, msZ: number): number | null {
    if (msZ > this.cfg.silenceMs) {
      this.frames.push({ t, m });
      while (this.frames.length > this.cfg.windowSeconds) this.frames.shift();
    }
    const cutoff = t - this.cfg.maxAgeSeconds * 1000;
    while (this.frames.length && this.frames[0].t < cutoff) this.frames.shift();
    return this.current();
  }

  current(): number | null {
    if (!this.frames.length) return null;
    const sum = emptyMoments();
    for (const f of this.frames) addMomentsInto(sum, f.m);
    return betaFromMoments(sum);
  }

  reset(): void {
    this.frames = [];
  }
}

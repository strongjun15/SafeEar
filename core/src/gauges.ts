/**
 * ④ 회복 적분기 F(t)와 이중 게이지. 계획서 3.4절, 3.5절, 6.2절, 14.3절.
 *
 *   dF_fast/dt = g_fast·D(t) − F_fast/τ_fast     τ_fast = 30분
 *   dF_slow/dt = g_slow·D(t) − F_slow/τ_slow     τ_slow = 240분  (Patuzzi 1998 — 피험자 1명, 초기값으로만 사용)
 *
 * 구현에서 정한 것 (9절 #2 F(t) 스케일, #5 하한):
 *  - D(t)는 첨도 보정 선량 [Pa²h/분]. 들어온 선량을 세 갈래로 나눈다:
 *      g_fast(0.25)는 빠르게 회복, g_slow(0.15)는 느리게 회복,
 *      나머지(0.60)는 7일 창 안에서는 회복되지 않는 몫(R) — "완전 회복이 아닌 부분 회복" (Kujawa & Liberman)
 *  - 표시값(%) = (F_fast + F_slow + R) / 주간 허용 선량 × 100 → H.870 80%/100% 선을 그대로 쓸 수 있다
 *  - 쉬지 않고 들으면 첨도 보정 선량과 같아지고, 쉬면 R까지 내려간다 (0으로 돌아가지 않음 — 6.1절)
 *  - 모두 선형이므로 기기별 기록을 합쳐 다시 계산해도 결과가 같다 (중첩 원리, V9)
 */
import { WEEK_MINUTES } from './constants.ts';

export interface RecoveryConfig {
  tauFastMin: number;
  tauSlowMin: number;
  gFast: number;
  gSlow: number;
  windowMin: number;
}

export const DEFAULT_RECOVERY: RecoveryConfig = {
  tauFastMin: 30,
  tauSlowMin: 240,
  gFast: 0.25,
  gSlow: 0.15,
  windowMin: WEEK_MINUTES,
};

export const residualShare = (c: RecoveryConfig): number => Math.max(0, 1 - c.gFast - c.gSlow);

/** 1분 단위 선량. minute = floor(epoch ms / 60000) */
export interface MinuteDose {
  minute: number;
  /** 등에너지 선량 [Pa²h] — 기존 방식 */
  eeh: number;
  /** 첨도 보정 선량 [Pa²h] */
  kurt: number;
}

export interface GaugeState {
  /** 기준 시각 (분) */
  minute: number;
  fast: number;
  slow: number;
  residual: number;
  /** 7일 등에너지 선량 합 [Pa²h] */
  weeklyEeh: number;
  /** 7일 첨도 보정 선량 합 [Pa²h] */
  weeklyKurt: number;
}

export const safeEarDose = (s: GaugeState): number => s.fast + s.slow + s.residual;

/** 7일 창 안의 기록으로 nowMinute 시점의 상태를 계산한다 */
export function integrate(doses: Iterable<MinuteDose>, nowMinute: number, cfg: RecoveryConfig = DEFAULT_RECOVERY): GaugeState {
  const from = nowMinute - cfg.windowMin;
  const list: MinuteDose[] = [];
  for (const d of doses) if (d.minute > from && d.minute <= nowMinute) list.push(d);
  list.sort((a, b) => a.minute - b.minute);
  const gR = residualShare(cfg);
  let fast = 0, slow = 0, residual = 0, eeh = 0, kurt = 0;
  let last = from;
  for (const d of list) {
    const gap = d.minute - last;
    if (gap > 0) {
      fast *= Math.exp(-gap / cfg.tauFastMin);
      slow *= Math.exp(-gap / cfg.tauSlowMin);
    }
    fast += cfg.gFast * d.kurt;
    slow += cfg.gSlow * d.kurt;
    residual += gR * d.kurt;
    eeh += d.eeh;
    kurt += d.kurt;
    last = d.minute;
  }
  const gap = nowMinute - last;
  if (gap > 0) {
    fast *= Math.exp(-gap / cfg.tauFastMin);
    slow *= Math.exp(-gap / cfg.tauSlowMin);
  }
  return { minute: nowMinute, fast, slow, residual, weeklyEeh: eeh, weeklyKurt: kurt };
}

/** 지금부터 restMin분 쉬면 SafeEar 선량이 얼마가 되는가 (3.4절 "30분 쉬면 47%") */
export function doseAfterRest(s: GaugeState, restMin: number, cfg: RecoveryConfig = DEFAULT_RECOVERY): number {
  return s.fast * Math.exp(-restMin / cfg.tauFastMin) + s.slow * Math.exp(-restMin / cfg.tauSlowMin) + s.residual;
}

export interface CurvePoint {
  minute: number;
  fast: number;
  slow: number;
}

/** 빠른/느린 피로 곡선 (오늘의 피로 곡선 차트용) */
export function fatigueCurve(
  doses: Iterable<MinuteDose>,
  fromMinute: number,
  toMinute: number,
  stepMin: number,
  cfg: RecoveryConfig = DEFAULT_RECOVERY,
): CurvePoint[] {
  const warmup = 24 * 60;
  const start = fromMinute - warmup;
  const map = new Map<number, number>();
  for (const d of doses) if (d.minute > start && d.minute <= toMinute) map.set(d.minute, (map.get(d.minute) ?? 0) + d.kurt);
  const df = Math.exp(-1 / cfg.tauFastMin);
  const ds = Math.exp(-1 / cfg.tauSlowMin);
  let fast = 0, slow = 0;
  const out: CurvePoint[] = [];
  for (let m = start + 1; m <= toMinute; m++) {
    fast *= df;
    slow *= ds;
    const k = map.get(m);
    if (k) {
      fast += cfg.gFast * k;
      slow += cfg.gSlow * k;
    }
    if (m >= fromMinute && (m - fromMinute) % stepMin === 0) out.push({ minute: m, fast, slow });
  }
  return out;
}

export interface Projection {
  /** 기준선을 처음 넘는 시각 (분). 이미 넘었으면 nowMinute, 예측 구간 안에 안 넘으면 null */
  minute: number | null;
  /** 예측에 쓴 과거 일수. 0이면 데이터 부족 */
  basisDays: number;
  method: 'seasonal-naive';
}

/**
 * AI-1 궤적 예측의 베이스라인 (계획서 5.2절): "지난 며칠 같은 시각의 평균만큼 앞으로도 듣는다"고 가정하고
 * SafeEar 게이지가 thresholdDose를 처음 넘는 시각을 찾는다. 학습 모델이 아니라 비교 기준선이다.
 */
export function projectCrossing(
  doses: Iterable<MinuteDose>,
  nowMinute: number,
  thresholdDose: number,
  cfg: RecoveryConfig = DEFAULT_RECOVERY,
  opts: { horizonMin?: number; lookbackDays?: number } = {},
): Projection {
  const horizon = opts.horizonMin ?? 72 * 60;
  const lookback = opts.lookbackDays ?? 7;
  const W = cfg.windowMin;
  const base = nowMinute - W; // index 0 ↔ minute base+1
  const size = W + horizon;
  const kurt = new Float64Array(size + 1);
  let first = Infinity;
  for (const d of doses) {
    if (d.minute > base && d.minute <= nowMinute) {
      kurt[d.minute - base] += d.kurt;
      if (d.kurt > 0 && d.minute < first) first = d.minute;
    }
  }
  const state = integrate(
    (function* () {
      for (let i = 1; i <= W; i++) if (kurt[i] > 0) yield { minute: base + i, eeh: 0, kurt: kurt[i] };
    })(),
    nowMinute,
    cfg,
  );
  if (safeEarDose(state) >= thresholdDose) return { minute: nowMinute, basisDays: 0, method: 'seasonal-naive' };
  if (!Number.isFinite(first)) return { minute: null, basisDays: 0, method: 'seasonal-naive' };
  const days = Math.max(1, Math.min(lookback, Math.ceil((nowMinute - first + 1) / 1440)));

  for (let i = W + 1; i <= size; i++) {
    let s = 0;
    for (let d = 1; d <= days; d++) {
      const j = i - d * 1440;
      if (j >= 1) s += kurt[j];
    }
    kurt[i] = s / days;
  }

  const gR = residualShare(cfg);
  const df = Math.exp(-1 / cfg.tauFastMin);
  const ds = Math.exp(-1 / cfg.tauSlowMin);
  let { fast, slow, residual } = state;
  for (let i = W + 1; i <= size; i++) {
    fast = fast * df + cfg.gFast * kurt[i];
    slow = slow * ds + cfg.gSlow * kurt[i];
    residual += gR * (kurt[i] - (i - W >= 1 ? kurt[i - W] : 0));
    if (fast + slow + residual >= thresholdDose) return { minute: base + i, basisDays: days, method: 'seasonal-naive' };
  }
  return { minute: null, basisDays: days, method: 'seasonal-naive' };
}

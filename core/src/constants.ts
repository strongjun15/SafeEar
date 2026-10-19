/**
 * 표준에서 가져온 상수. 각 값 옆에 출처(계획서 절 번호)를 적는다.
 */

/** 기준 음압 20 µPa (dB SPL의 0 dB) */
export const P0 = 20e-6;
export const P0_SQ = P0 * P0;

/** 주간 허용 선량 — ITU-T H.870 (계획서 3.5절) */
export const H870 = {
  /** Mode 1: 성인, 80 dBA × 40시간/주 */
  1: { weeklyPa2h: 1.6, refDbA: 80 },
  /** Mode 2: 아동·민감 사용자, 75 dBA × 40시간/주 — SafeEar 기본값 */
  2: { weeklyPa2h: 0.51, refDbA: 75 },
} as const;

export type HearingMode = 1 | 2;

/** H.870 경고선 (%) — 계획서 9절 #1 권장 방향 */
export const WARN_LEVELS_PCT = [80, 100] as const;

/** 7일 롤링 창 (분) — H.870, 계획서 14.3절 #7 */
export const WEEK_MINUTES = 7 * 24 * 60;

/** 1분 요약 레코드 스키마 버전 (계획서 14.2절) */
export const SCHEMA_VERSION = 1;

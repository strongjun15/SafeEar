/**
 * ③ 에너지 선량. 계획서 3.1절, 3.5절 (H.870).
 */
import { H870, P0_SQ, type HearingMode } from './constants.ts';

/** dB SPL → 음압 제곱 [Pa²] */
export const pa2FromDb = (db: number): number => P0_SQ * Math.pow(10, db / 10);

/** 음압 제곱 [Pa²] → dB SPL */
export const dbFromPa2 = (pa2: number): number => (pa2 > 0 ? 10 * Math.log10(pa2 / P0_SQ) : -Infinity);

/** 일정한 레벨로 seconds초 들었을 때의 선량 [Pa²h] */
export const doseFromLevel = (laeqDb: number, seconds: number): number => (pa2FromDb(laeqDb) * seconds) / 3600;

export const weeklyAllowance = (mode: HearingMode): number => H870[mode].weeklyPa2h;

export const percentOfAllowance = (pa2h: number, mode: HearingMode): number => (pa2h / weeklyAllowance(mode)) * 100;

/**
 * 주간 선량 → L_EX,8h (주 5일 × 8시간 = 40시간 기준 등가 레벨). ISO 1999 입력용 (3.6절)
 * 예: 1.6 Pa²h/주 → 80 dB
 */
export const lex8hFromWeeklyDose = (weeklyPa2h: number): number => dbFromPa2(weeklyPa2h / 40);

/** 나이대 (정확한 생년월일 대신 구간 — 14.5절 수집 최소화). 만 14세 미만은 가입 불가 */
export type AgeBand = '14-17' | '18-19' | '20s' | '30plus';

export const AGE_BAND_LABELS: Record<AgeBand, string> = {
  '14-17': '만 14~17세',
  '18-19': '만 18~19세',
  '20s': '20대',
  '30plus': '30대 이상',
};

/** 18세 미만은 Mode 2로 고정, 그 외는 기본 Mode 2 + 사용자가 Mode 1 선택 가능 (3.5절) */
export function allowedModes(age: AgeBand | null): HearingMode[] {
  return age === '14-17' || age == null ? [2] : [2, 1];
}

export function resolveMode(age: AgeBand | null, requested: HearingMode | null | undefined): HearingMode {
  const allowed = allowedModes(age);
  return requested && allowed.includes(requested) ? requested : 2;
}

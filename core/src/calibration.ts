/**
 * 디지털 레벨(dBFS) → 귀에 들어가는 소리 크기(dB SPL A) 추정. 계획서 13.3절, 9절 #3.
 *
 *   크기 (dB SPL 추정) ← 디지털 레벨(dBFS) + 볼륨 + 기기·이어폰 프로필
 *
 * ⚠ 교정되지 않은 기본값이다. 이어폰·볼륨 곡선에 따라 ±10 dB 이상 틀릴 수 있다.
 *   그래서 이 값으로 만든 숫자는 "같은 기기 안의 상대 비교"로 해석한다 (원칙 3).
 */

export interface CalibrationProfile {
  id: string;
  /** 볼륨 100%에서 평균제곱 1(0 dBFS RMS) 신호가 만드는 A-가중 SPL [dB] */
  refSplDb: number;
  /** 추정 불확실성 [dB] — 레코드에 함께 저장 */
  uncertaintyDb: number;
}

/**
 * 기본 프로필. EN 50332-1은 −10 dBFS 시험 신호에서 최대 100 dBA를 상한으로 두므로
 * 0 dBFS RMS는 대략 105~113 dBA 범위가 된다. 가운데쯤인 105를 임시값으로 쓴다.
 */
export const DEFAULT_CALIBRATION: CalibrationProfile = {
  id: 'generic-v0',
  refSplDb: 105,
  uncertaintyDb: 10,
};

export interface VolumeInfo {
  /** 출력 장치 마스터 볼륨 감쇠 [dB] (100%면 0, 작을수록 음수) */
  volumeDb: number;
  muted: boolean;
}

/**
 * @param msA A-가중 평균제곱 [FS²]
 * @param loopbackIncludesVolume 캡처한 신호에 시스템 볼륨이 이미 적용돼 있는지 (9절 #11 — 실험으로 확인)
 * @returns 추정 SPL [dBA], 무음·음소거면 null
 */
export function estimateSplA(
  msA: number,
  vol: VolumeInfo,
  profile: CalibrationProfile,
  loopbackIncludesVolume: boolean,
): number | null {
  if (vol.muted || !(msA > 0)) return null;
  const dbfsA = 10 * Math.log10(msA);
  return dbfsA + profile.refSplDb + (loopbackIncludesVolume ? 0 : vol.volumeDb);
}

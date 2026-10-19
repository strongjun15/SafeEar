import { describe, it } from 'node:test';
import { expect } from './expect.ts';
import {
  BAND_COUNT,
  BAND_LABELS,
  DEFAULT_RECOVERY,
  MinuteAggregator,
  aWeightingDb,
  analyzeFrame,
  doseAfterRest,
  doseFromLevel,
  estimateSplA,
  fatigueCurve,
  integrate,
  kurtosisWeight,
  KurtosisWindow,
  lex8hFromWeeklyDose,
  mergeRecords,
  nipts50,
  pa2FromDb,
  percentOfAllowance,
  projectCrossing,
  resolveMode,
  safeEarDose,
  type MinuteDose,
  type MinuteRecord,
  type SecondSample,
} from '../src/index.ts';
import { SR, impulseTrain, pinkNoise, sine, whiteNoise } from './signals.ts';

const db = (r: number) => 10 * Math.log10(r);

describe('A-가중 (IEC 61672)', () => {
  it('1 kHz에서 0 dB, 대표 주파수에서 표준값', () => {
    expect(aWeightingDb(1000)).toBeCloseTo(0, 2);
    expect(aWeightingDb(100)).toBeCloseTo(-19.1, 1);
    expect(aWeightingDb(4000)).toBeCloseTo(1.0, 1);
    expect(aWeightingDb(10000)).toBeCloseTo(-2.5, 1);
  });
});

describe('1초 프레임 분석', () => {
  it('1 kHz 사인파: β≈1.5, 1k 대역에 에너지 집중, 레벨 비례', () => {
    const x = sine(1000, 0.5);
    const f = analyzeFrame([x], SR);
    expect(f.msZ).toBeCloseTo(0.125, 4);
    expect(f.msA / f.msZ).toBeCloseTo(1, 2);
    expect(f.betaFrame!).toBeCloseTo(1.5, 2);
    const k1 = BAND_LABELS.indexOf('1k');
    expect(f.bandMsA[k1] / f.msA).toBeGreaterThan(0.97);
    const half = analyzeFrame([sine(1000, 0.25)], SR);
    expect(db(f.msA / half.msA)).toBeCloseTo(6.02, 1);
  });

  it('100 Hz 사인파는 A-가중으로 약 19 dB 낮아진다', () => {
    const f = analyzeFrame([sine(100, 0.5)], SR);
    expect(db(f.msA / f.msZ)).toBeCloseTo(-19.1, 0);
  });

  it('가우시안 백색잡음: β≈3 → 첨도 보정 무효 (V3)', () => {
    const f = analyzeFrame([whiteNoise(0.1, 2)], SR);
    expect(f.betaFrame!).toBeGreaterThan(2.9);
    expect(f.betaFrame!).toBeLessThan(3.1);
    expect(kurtosisWeight(3)).toBe(1);
    expect(kurtosisWeight(f.betaFrame)).toBeCloseTo(1, 1);
  });

  it('임펄스열: β ≫ 3 → 배율 > 1', () => {
    const f = analyzeFrame([impulseTrain()], SR);
    expect(f.betaFrame!).toBeGreaterThan(10);
    expect(kurtosisWeight(f.betaFrame)).toBeGreaterThan(1.5);
  });

  it('β = 9, λ = 6.5 → 배율 ≈ 2.04 ("1초를 2초로", 3.2절)', () => {
    expect(kurtosisWeight(9)).toBeCloseTo(2.04, 2);
    expect(kurtosisWeight(1.5)).toBe(1); // β < 3 하한
    expect(kurtosisWeight(1000)).toBeCloseTo(kurtosisWeight(100), 12); // β 상한
  });

  it('핑크 노이즈: 1/3 옥타브 대역 에너지가 고르게 (A-가중 제거 후 ±3 dB)', () => {
    const f = analyzeFrame([pinkNoise(0.1, 4)], SR);
    const centers = [125, 160, 200, 250, 315, 400, 500, 630, 800, 1000, 1250, 1600, 2000, 2500, 3150, 4000, 5000, 6300, 8000];
    const flat = f.bandMsA.map((v, i) => db(v) - aWeightingDb(centers[i]));
    const mean = flat.reduce((a, b) => a + b, 0) / flat.length;
    for (const v of flat) expect(Math.abs(v - mean)).toBeLessThan(3);
  });

  it('무음: 모든 값 0', () => {
    const f = analyzeFrame([new Float32Array(SR)], SR);
    expect(f.msZ).toBe(0);
    expect(f.msA).toBe(0);
    expect(f.betaFrame).toBeNull();
  });

  it('스테레오: 채널 평균 에너지', () => {
    const l = sine(1000, 0.5);
    const f = analyzeFrame([l, new Float32Array(SR)], SR);
    expect(f.msZ).toBeCloseTo(0.0625, 4);
    expect(f.bandMsA.length).toBe(BAND_COUNT);
  });
});

describe('첨도 이동창', () => {
  it('조용한 프레임은 창에 넣지 않는다', () => {
    const w = new KurtosisWindow();
    const noise = analyzeFrame([whiteNoise(0.1, 1, 7)], SR);
    const silent = analyzeFrame([new Float32Array(SR)], SR);
    const b1 = w.push(0, noise.moments, noise.msZ)!;
    const b2 = w.push(1000, silent.moments, silent.msZ)!;
    expect(b2).toBeCloseTo(b1, 6);
  });
});

describe('에너지 선량 (H.870, V1)', () => {
  it('75 dBA × 40시간 ≈ 0.51 Pa²h (Mode 2 기준선량)', () => {
    expect(doseFromLevel(75, 40 * 3600)).toBeCloseTo(0.506, 3);
    expect(percentOfAllowance(doseFromLevel(75, 40 * 3600), 2)).toBeCloseTo(99.2, 0);
  });
  it('80 dBA × 40시간 = 1.6 Pa²h (Mode 1)', () => {
    expect(doseFromLevel(80, 40 * 3600)).toBeCloseTo(1.6, 3);
    expect(lex8hFromWeeklyDose(1.6)).toBeCloseTo(80, 6);
  });
  it('18세 미만은 Mode 2로 고정', () => {
    expect(resolveMode('14-17', 1)).toBe(2);
    expect(resolveMode('20s', 1)).toBe(1);
    expect(resolveMode('20s', null)).toBe(2);
  });
  it('SPL 추정: dBFS + 기준 + 볼륨', () => {
    const msA = 0.01; // −20 dBFS
    expect(estimateSplA(msA, { volumeDb: -10, muted: false }, { id: 'x', refSplDb: 105, uncertaintyDb: 10 }, false)).toBeCloseTo(75, 6);
    expect(estimateSplA(msA, { volumeDb: -10, muted: false }, { id: 'x', refSplDb: 105, uncertaintyDb: 10 }, true)).toBeCloseTo(85, 6);
    expect(estimateSplA(msA, { volumeDb: -10, muted: true }, { id: 'x', refSplDb: 105, uncertaintyDb: 10 }, false)).toBeNull();
  });
});

const minutes = (from: number, count: number, kurt: number, eeh = kurt): MinuteDose[] =>
  Array.from({ length: count }, (_, i) => ({ minute: from + i, eeh, kurt }));

describe('회복 적분기 (V4)', () => {
  it('쉬지 않은 직후에는 첨도 보정 선량과 같다', () => {
    const s = integrate(minutes(1000, 1, 0.01), 1000);
    expect(safeEarDose(s)).toBeCloseTo(0.01, 12);
    expect(s.weeklyEeh).toBeCloseTo(0.01, 12);
  });

  it('무음이면 빠른 성분은 30분, 느린 성분은 240분 시간상수로 줄고 0으로는 안 돌아간다', () => {
    const s0 = integrate(minutes(1000, 60, 0.001), 1059);
    const s30 = integrate(minutes(1000, 60, 0.001), 1089);
    expect(s30.fast / s0.fast).toBeCloseTo(Math.exp(-1), 6);
    expect(s30.slow / s0.slow).toBeCloseTo(Math.exp(-30 / 240), 6);
    expect(s30.residual).toBeCloseTo(s0.residual, 12);
    const later = integrate(minutes(1000, 60, 0.001), 1059 + 3000);
    expect(safeEarDose(later)).toBeGreaterThan(0);
    expect(safeEarDose(later)).toBeCloseTo(s0.residual, 4);
  });

  it('doseAfterRest는 실제로 쉰 뒤의 적분과 같다', () => {
    const d = minutes(1000, 90, 0.002);
    const s = integrate(d, 1089);
    expect(doseAfterRest(s, 30)).toBeCloseTo(safeEarDose(integrate(d, 1119)), 12);
  });

  it('7일이 지나면 창에서 빠진다', () => {
    const s = integrate(minutes(0, 10, 0.01), 10 + DEFAULT_RECOVERY.windowMin);
    expect(s.weeklyEeh).toBe(0);
    expect(safeEarDose(s)).toBe(0);
  });

  it('피로 곡선은 integrate와 같은 값을 낸다', () => {
    const d = minutes(5000, 120, 0.001);
    const c = fatigueCurve(d, 5000, 5200, 10);
    const last = c[c.length - 1];
    const s = integrate(d, last.minute);
    expect(last.fast).toBeCloseTo(s.fast, 10);
    expect(last.slow).toBeCloseTo(s.slow, 10);
  });
});

describe('다기기 병합 (V9)', () => {
  const rec = (device: string, minute: number, kurt: number, type: MinuteRecord['output_type'] = 'headphones') => ({
    device_id: device,
    minute_start: new Date(minute * 60000).toISOString(),
    output_type: type,
    dose_eeh: kurt / 1.2,
    dose_kurt: kurt,
    band_dose: null,
    listen_seconds: 60,
  });

  it('한 기기 기록을 두 기기로 나눠도 F(t)·주간 선량이 같다', () => {
    const base = 30_000_000;
    const all = Array.from({ length: 200 }, (_, i) => rec('A', base + i * 3, 0.0005 + (i % 7) * 0.0001));
    const split = all.map((r, i) => ({ ...r, device_id: i % 2 ? 'B' : 'A' }));
    const now = base + 700;
    const a = integrate(mergeRecords(all).values(), now);
    const b = integrate(mergeRecords(split).values(), now);
    expect(safeEarDose(b)).toBeCloseTo(safeEarDose(a), 12);
    expect(b.weeklyEeh).toBeCloseTo(a.weeklyEeh, 12);
  });

  it('스피커 출력은 빼고, 같은 분 겹침은 큰 값을 쓴다', () => {
    const m = mergeRecords([rec('A', 100, 0.002), rec('B', 100, 0.005), rec('C', 101, 0.009, 'speaker')]);
    expect(m.size).toBe(1);
    const x = m.get(100)!;
    expect(x.kurt).toBe(0.005);
    expect(x.overlap).toBe(true);
  });
});

describe('1분 레코드 집계', () => {
  const sample = (t: number, over: Partial<SecondSample> = {}): SecondSample => ({
    t,
    audible: true,
    outputType: 'headphones',
    outputId: 'dev1',
    pa2: pa2FromDb(80),
    kurtWeight: 1.5,
    beta: 6,
    bandFrac: new Array(BAND_COUNT).fill(1 / BAND_COUNT),
    volumeIndex: 40,
    app: 'Spotify.exe',
    tier: 'B',
    ...over,
  });

  it('60초를 모아 한 레코드를 만든다', () => {
    const agg = new MinuteAggregator({ deviceId: () => 'pc', calibration: () => ({ id: 'generic-v0', uncertaintyDb: 10 }), appVersion: 't' });
    const t0 = 1_700_000_040_000; // 분 경계
    for (let i = 0; i < 60; i++) expect(agg.add(sample(t0 + i * 1000))).toBeNull();
    const r = agg.add(sample(t0 + 60_000, { audible: false, pa2: 0 }))!;
    expect(r.listen_seconds).toBe(60);
    expect(r.laeq_db).toBeCloseTo(80, 2);
    expect(r.dose_eeh).toBeCloseTo(doseFromLevel(80, 60), 12);
    expect(r.dose_kurt!).toBeCloseTo(1.5 * r.dose_eeh, 12);
    expect(r.content_label).toBe('music');
    expect(r.band_dose!.reduce((a, b) => a + b, 0)).toBeCloseTo(r.dose_eeh, 12);
  });

  it('스피커로만 나온 분은 speaker 레코드', () => {
    const agg = new MinuteAggregator({ deviceId: () => 'pc', calibration: () => ({ id: 'g', uncertaintyDb: 10 }), appVersion: 't' });
    const t0 = 1_700_000_040_000;
    for (let i = 0; i < 10; i++) agg.add(sample(t0 + i * 1000, { outputType: 'speaker' }));
    expect(agg.partial()).toBeNull();
    expect(agg.flush()!.output_type).toBe('speaker');
  });
});

describe('사전 예측 베이스라인 (AI-1 비교 기준)', () => {
  it('매일 같은 시간에 들으면 언젠가 100%를 넘는 시점을 찾는다', () => {
    const now = 40_000_000;
    const d: MinuteDose[] = [];
    for (let day = 1; day <= 3; day++) d.push(...minutes(now - day * 1440 + 60, 120, 0.002));
    const p = projectCrossing(d, now, 0.51);
    expect(p.basisDays).toBeGreaterThan(0);
    expect(p.minute).not.toBeNull();
    expect(p.minute!).toBeGreaterThan(now);
  });
  it('데이터가 없으면 null', () => {
    expect(projectCrossing([], 1000, 0.51).minute).toBeNull();
  });
});

describe('ISO 1999 NIPTS', () => {
  it('4 kHz, 85 dB, 10년 → 5 dB', () => {
    expect(nipts50(4000, 85, 10)).toBeCloseTo(5, 6);
  });
  it('L₀ 이하는 0, 10년 미만은 로그 보간', () => {
    expect(nipts50(4000, 74, 10)).toBe(0);
    expect(nipts50(4000, 85, 5)).toBeCloseTo((Math.log10(6) / Math.log10(11)) * 5, 6);
  });
});

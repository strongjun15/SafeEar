import { buildReport, type ReportRecord } from '../shared/report';
/**
 * 게이지 계산 — 이 기기 기록 + 같은 계정의 다른 기기 기록을 합친 타임라인 위에서 (계획서 14.3절).
 */
import { hostname } from 'node:os';
import {
  BAND_COUNT,
  DEFAULT_RECOVERY,
  doseAfterRest,
  fatigueCurve,
  integrate,
  isoOfMinute,
  lex8hFromWeeklyDose,
  mergeRecords,
  minuteOfIso,
  minuteOfMs,
  niptsCurve,
  projectCrossing,
  resolveMode,
  weeklyAllowance,
  type MergeInput,
  type MergedMinute,
} from '@safeear/core';
import type { GaugeView, RemoteDevice } from '../shared/types';
import type { Meter } from './meter';
import type { SettingsStore } from './settings';
import type { RecordStore, StoredRecord } from './store';

const LABEL_KO: Record<string, string> = {
  music: '음악',
  video: '영상',
  game: '게임',
  call: '통화',
  browser: '브라우저',
  other: '기타',
};

export interface GaugeDeps {
  store: RecordStore;
  settings: SettingsStore;
  meter: Meter;
  ownerId: () => string | null;
  thisDeviceIds: () => string[];
  remoteRecords: () => (MergeInput & { content_label?: string | null })[];
  remoteDevices: () => RemoteDevice[];
}

const REST_OPTIONS = [10, 30, 60, 120];

export class GaugeService {
  view: GaugeView;
  private heavyAt = 0;
  private projectionAt = 0;

  constructor(private readonly d: GaugeDeps) {
    this.view = this.empty();
  }

  private empty(): GaugeView {
    const mode = resolveMode(this.d.settings.value.ageBand, this.d.settings.value.mode);
    return {
      mode,
      allowancePa2h: weeklyAllowance(mode),
      safeEarPct: 0,
      standardPct: 0,
      fastPct: 0,
      slowPct: 0,
      residualPct: 0,
      rest: REST_OPTIONS.map((min) => ({ min, pct: 0 })),
      projection: { minute: null, basisDays: 0 },
      todayListenSec: 0,
      todayPct: 0,
      curve: [],
      bands: new Array(BAND_COUNT).fill(0),
      bandCoverage: 0,
      devices: [],
      heat: Array.from({ length: 7 }, () => new Array(12).fill(0)),
      heatDays: [],
      weekDays: [],
      todayHours: new Array(24).fill(0),
      todayApps: [],
      apps: [],
      volumeTrend: [],
      iso: { lex8h: null, scenarios: [] },
      overlapMinutes: 0,
    };
  }

  /** 다음 compute()에서 무거운 집계도 다시 하게 한다 */
  invalidate(): void {
    this.heavyAt = 0;
    this.projectionAt = 0;
  }

  private localRecords(sinceMinute: number): StoredRecord[] {
    const owner = this.d.ownerId();
    return this.d.store.recent(sinceMinute).filter((r) => r.owner_id === owner || r.owner_id === null);
  }

  report(date: string, view: 'day' | 'week') {
    const start = new Date(`${date}T00:00:00`); if (view === 'week') start.setDate(start.getDate() - 6);
    const records: ReportRecord[] = [...this.localRecords(minuteOfMs(start.getTime())), ...this.d.remoteRecords()];
    const partial = this.d.meter.partial();
    if (partial) records.push({ device_id: this.d.thisDeviceIds()[0], minute_start: isoOfMinute(partial.minute), output_type: 'headphones', dose_eeh: partial.eeh, dose_kurt: partial.kurt, band_dose: null, listen_seconds: this.d.meter.partialListenSeconds() });
    return buildReport(records, date, view, resolveMode(this.d.settings.value.ageBand, this.d.settings.value.mode));
  }

  compute(nowMs = Date.now()): GaugeView {
    const now = minuteOfMs(nowMs);
    const W = DEFAULT_RECOVERY.windowMin;
    const mode = resolveMode(this.d.settings.value.ageBand, this.d.settings.value.mode);
    const allowance = weeklyAllowance(mode);
    const pct = (x: number) => (x / allowance) * 100;

    const local = this.localRecords(now - W);
    const remote = this.d.remoteRecords().filter((r) => minuteOfIso(r.minute_start) > now - W);
    const partial = this.d.meter.partial();
    const thisIds = this.d.thisDeviceIds();
    const inputs: MergeInput[] = [...local, ...remote];
    if (partial) {
      inputs.push({
        device_id: thisIds[0],
        minute_start: isoOfMinute(partial.minute),
        output_type: 'headphones',
        dose_eeh: partial.eeh,
        dose_kurt: partial.kurt,
        band_dose: null,
        listen_seconds: this.d.meter.partialListenSeconds(),
      });
    }
    const merged = mergeRecords(inputs);
    const state = integrate(merged.values(), now);
    const se = state.fast + state.slow + state.residual;

    let v: GaugeView = {
      ...this.view,
      mode,
      allowancePa2h: allowance,
      safeEarPct: pct(se),
      standardPct: pct(state.weeklyEeh),
      fastPct: pct(state.fast),
      slowPct: pct(state.slow),
      residualPct: pct(state.residual),
      rest: REST_OPTIONS.map((min) => ({ min, pct: pct(doseAfterRest(state, min)) })),
    };

    const today = new Date(nowMs);
    today.setHours(0, 0, 0, 0);
    const todayMin = minuteOfMs(today.getTime());
    let todaySec = 0;
    let todayKurt = 0;
    for (const m of merged.values()) {
      if (m.minute >= todayMin) {
        todaySec += m.listenSeconds;
        todayKurt += m.kurt;
      }
    }
    v.todayListenSec = todaySec;
    v.todayPct = pct(todayKurt);

    if (nowMs - this.heavyAt > 30_000) {
      this.heavyAt = nowMs;
      v = { ...v, ...this.heavy(nowMs, now, merged, local, remote, allowance, state.weeklyEeh) };
    }
    if (nowMs - this.projectionAt > 60_000) {
      this.projectionAt = nowMs;
      const p = projectCrossing(merged.values(), now, allowance);
      v.projection = { minute: p.minute, basisDays: p.basisDays };
    }
    this.view = v;
    return v;
  }

  private heavy(
    nowMs: number,
    now: number,
    merged: Map<number, MergedMinute>,
    local: StoredRecord[],
    remote: (MergeInput & { content_label?: string | null })[],
    allowance: number,
    weeklyEeh: number,
  ): Partial<GaugeView> {
    const pct = (x: number) => (x / allowance) * 100;
    const thisIds = new Set(this.d.thisDeviceIds());

    const curve = fatigueCurve(merged.values(), minuteOfMs(new Date(nowMs).setHours(0, 0, 0, 0)), now, 5).map((p) => ({
      minute: p.minute,
      fast: pct(p.fast),
      slow: pct(p.slow),
    }));

    const bands = new Array(BAND_COUNT).fill(0);
    let withBand = 0;
    let total = 0;
    let overlap = 0;
    let first = Infinity;
    for (const m of merged.values()) {
      total += m.listenSeconds;
      if (m.overlap) overlap++;
      if (m.kurt > 0 && m.minute < first) first = m.minute;
      if (m.band) {
        withBand += m.listenSeconds;
        for (let b = 0; b < BAND_COUNT; b++) bands[b] += m.band[b];
      }
    }

    const perDevice = new Map<string, number>();
    for (const r of [...local, ...remote]) {
      if (r.output_type === 'speaker') continue;
      const id = thisIds.has(r.device_id) ? 'this' : r.device_id;
      perDevice.set(id, (perDevice.get(id) ?? 0) + (r.dose_kurt ?? r.dose_eeh));
    }
    const devTotal = [...perDevice.values()].reduce((a, b) => a + b, 0);
    const names = new Map(this.d.remoteDevices().map((x) => [x.id, x]));
    const devices = [...perDevice.entries()]
      .map(([id, dose]) => ({
        id,
        name: id === 'this' ? `이 PC (${hostname()})` : names.get(id)?.name ?? '다른 기기',
        isThis: id === 'this',
        pct: devTotal > 0 ? (dose / devTotal) * 100 : 0,
        platform: id === 'this' ? 'windows' : names.get(id)?.platform ?? null,
      }))
      .sort((a, b) => b.pct - a.pct);

    // 요일 × 2시간 히트맵 (현지 시각, 마지막 줄이 오늘)
    const heat = Array.from({ length: 7 }, () => new Array(12).fill(0));
    const heatDays: string[] = [];
    const day0 = new Date(nowMs);
    day0.setHours(0, 0, 0, 0);
    day0.setDate(day0.getDate() - 6);
    const DOW = ['일', '월', '화', '수', '목', '금', '토'];
    for (let i = 0; i < 7; i++) {
      const d = new Date(day0);
      d.setDate(day0.getDate() + i);
      heatDays.push(DOW[d.getDay()]);
    }
    const todayHours = new Array<number>(24).fill(0);
    const todayStart = new Date(nowMs).setHours(0, 0, 0, 0);
    const weekDays = heatDays.map((day, i) => {
      const date = new Date(day0); date.setDate(date.getDate() + i);
      return { date: `${date.getMonth() + 1}/${date.getDate()}`, day, listenSec: 0 };
    });
    for (const m of merged.values()) {
      const dt = new Date(m.minute * 60000);
      const dayIdx = Math.floor((new Date(dt).setHours(0, 0, 0, 0) - day0.getTime()) / 86400_000 + 0.5);
      if (dayIdx < 0 || dayIdx > 6) continue;
      heat[dayIdx][Math.floor(dt.getHours() / 2)] += m.kurt;
      weekDays[dayIdx].listenSec += m.listenSeconds;
      if (dt.getTime() >= todayStart) todayHours[dt.getHours()] += m.listenSeconds;
    }

    // 무엇으로 들었나: 이 기기는 앱 이름, 다른 기기는 범주
    const byLabel = new Map<string, number>();
    for (const r of local) {
      if (r.output_type === 'speaker') continue;
      const k = r.app_name ?? LABEL_KO[r.content_label ?? 'other'] ?? '기타';
      byLabel.set(k, (byLabel.get(k) ?? 0) + (r.dose_kurt ?? r.dose_eeh));
    }
    for (const r of remote) {
      if (r.output_type === 'speaker') continue;
      const k = `다른 기기 · ${LABEL_KO[r.content_label ?? 'other'] ?? '기타'}`;
      byLabel.set(k, (byLabel.get(k) ?? 0) + (r.dose_kurt ?? r.dose_eeh));
    }
    const labelTotal = [...byLabel.values()].reduce((a, b) => a + b, 0);
    let apps = [...byLabel.entries()]
      .map(([label, dose]) => ({ label, pct: labelTotal > 0 ? (dose / labelTotal) * 100 : 0 }))
      .sort((a, b) => b.pct - a.pct);
    if (apps.length > 4) {
      const rest = apps.slice(3).reduce((a, b) => a + b.pct, 0);
      apps = [...apps.slice(0, 3), { label: '그 밖의 앱', pct: rest }];
    }

    // 볼륨 추세: 이 기기 × 현재 출력 장치 조합 안에서만 (14.4절)
    const outId = this.d.meter.live.output.id;
    const days21 = this.localRecords(now - 21 * 1440).filter((r) => r.volume_index != null && r.output_type !== 'speaker');
    const sameOut = outId ? days21.filter((r) => r.output_id === outId) : days21;
    const byDay = new Map<string, { s: number; n: number }>();
    for (const r of sameOut) {
      const d = new Date(r.minute_start);
      const key = `${d.getMonth() + 1}/${d.getDate()}`;
      const cur = byDay.get(key) ?? { s: 0, n: 0 };
      cur.s += (r.volume_index ?? 0) * r.listen_seconds;
      cur.n += r.listen_seconds;
      byDay.set(key, cur);
    }
    const volumeTrend = [...byDay.entries()].map(([day, x]) => ({ day, avg: x.s / x.n }));

    // 10년 뒤: 지난 기록으로 1주일치 선량을 어림해 ISO 1999에 넣는다
    let lex8h: number | null = null;
    if (Number.isFinite(first) && weeklyEeh > 0) {
      const spanDays = Math.max(1, Math.min(7, (now - first) / 1440));
      lex8h = lex8hFromWeeklyDose((weeklyEeh * 7) / spanDays);
    }
    const scenarios = lex8h == null
      ? []
      : [
          { id: 'now' as const, deltaDb: 0, points: niptsCurve(lex8h, 0) },
          { id: 'keep' as const, deltaDb: 0, points: niptsCurve(lex8h, 10) },
          { id: 'down' as const, deltaDb: -3, points: niptsCurve(lex8h - 3, 10) },
        ];

    const todayByApp = new Map<string, number>();
    for (const r of [...local, ...remote]) {
      if (r.output_type === 'speaker' || new Date(r.minute_start).getTime() < todayStart) continue;
      const label = 'app_name' in r && r.app_name ? String(r.app_name) : LABEL_KO[r.content_label ?? 'other'] ?? '기타';
      todayByApp.set(label, (todayByApp.get(label) ?? 0) + (r.dose_kurt ?? r.dose_eeh));
    }
    const todayTotal = [...todayByApp.values()].reduce((a, b) => a + b, 0);
    const todayApps = [...todayByApp].map(([label, value]) => ({ label, pct: todayTotal > 0 ? value / todayTotal * 100 : 0 })).sort((a, b) => b.pct - a.pct);
    return {
      todayHours,
      todayApps,
      curve,
      bands,
      bandCoverage: total > 0 ? withBand / total : 0,
      devices,
      heat,
      heatDays,
      weekDays,
      apps,
      volumeTrend,
      iso: { lex8h, scenarios },
      overlapMinutes: overlap,
    };
  }
}

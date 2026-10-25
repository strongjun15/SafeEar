import { buildReport } from '../shared/report';
/**
 * 브라우저 미리보기용 가짜 main 프로세스.
 * 윈도우가 아닌 곳에서 화면(껍데기)을 확인하려고, 6일치 합성 청취 기록을 만들어 core의 같은 계산으로 게이지를 그린다.
 * 실제 측정 · 로그인 · 동기화는 하지 않는다.
 */
import {
  BAND_COUNT,
  doseAfterRest,
  fatigueCurve,
  integrate,
  isoOfMinute,
  lex8hFromWeeklyDose,
  mergeRecords,
  minuteOfMs,
  niptsCurve,
  pa2FromDb,
  projectCrossing,
  resolveMode,
  weeklyAllowance,
  type MinuteRecord,
} from '@safeear/core';
import type { AppState, RemoteDevice, Result, SafeEarApi, Settings, WaveChunk } from '../shared/types';

const DEMO_EMAIL = 'test11';
const DEMO_PASSWORD = 'test11';
const isDemo = () => session_.signedIn && session_.user?.id === 'preview-demo';
const unavailable = async (): Promise<Result<never>> => ({ ok: false, error: '계정 서버 연결이 필요해요. 실제 계정 로그인과 이메일 인증은 앱의 서버 설정 후 사용할 수 있어요.' });

type Rec = MinuteRecord;
const THIS = 'this-pc', PHONE = 'my-phone', PAD = 'my-pad';
const DEVICES: RemoteDevice[] = [
  { id: THIS, name: 'NABLA-PC', platform: 'windows', last_seen_at: new Date().toISOString() },
  { id: PHONE, name: 'Galaxy S25', platform: 'android', last_seen_at: new Date(Date.now() - 40 * 60000).toISOString() },
  { id: PAD, name: 'iPad Air', platform: 'ipados', last_seen_at: new Date(Date.now() - 26 * 3600000).toISOString() },
];

let seed = 42;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

/** 대역 모양: 음악은 저·중음, 게임은 2~5k에 뾰족 */
function bandShape(kind: 'music' | 'game' | 'video'): number[] {
  return Array.from({ length: BAND_COUNT }, (_, i) => {
    const base = kind === 'game' ? 0.5 + Math.exp(-((i - 15) ** 2) / 6) * 1.6 : kind === 'video' ? 0.6 + Math.exp(-((i - 10) ** 2) / 10) : 1.2 - i * 0.03 + Math.exp(-((i - 15) ** 2) / 4) * 0.5;
    return Math.max(0.05, base * (0.85 + rnd() * 0.3));
  });
}

function session(device: string, startMs: number, minutes: number, kind: 'music' | 'game' | 'video', db: number, beta: number, app: string | null, vol: number): Rec[] {
  const out: Rec[] = [];
  const shape = bandShape(kind);
  const sum = shape.reduce((a, b) => a + b, 0);
  for (let m = 0; m < minutes; m++) {
    const laeq = db + (rnd() - 0.5) * 3 + (kind === 'music' ? m / minutes : 0) * 1.5;
    const b = beta * (0.8 + rnd() * 0.4);
    const eeh = pa2FromDb(laeq) / 60;
    const w = Math.max(1, Math.pow(Math.min(b, 100) / 3, 0.65));
    out.push({
      device_id: device,
      minute_start: isoOfMinute(minuteOfMs(startMs) + m),
      output_id: 'out-1',
      output_type: 'headphones',
      tier: 'B',
      listen_seconds: 60,
      laeq_db: laeq,
      dose_eeh: eeh,
      dose_kurt: eeh * w,
      beta: b,
      band_dose: shape.map((s) => (eeh * s) / sum),
      volume_index: vol + (rnd() - 0.5) * 4,
      content_label: kind,
      app_name: device === THIS ? app : null,
      calib_profile_id: 'generic-v0',
      calib_uncertainty_db: 10,
      schema_version: 1,
      app_version: 'preview',
    });
  }
  return out;
}

function buildHistory(): Rec[] {
  const recs: Rec[] = [];
  const day0 = new Date();
  day0.setHours(0, 0, 0, 0);
  for (let d = 6; d >= 1; d--) {
    const at = (h: number, min = 0) => day0.getTime() - d * 86400000 + (h * 60 + min) * 60000;
    const weekend = [0, 6].includes(new Date(at(12)).getDay());
    recs.push(...session(PHONE, at(7, 40), 35, 'music', 74, 4, null, 0));
    recs.push(...session(PHONE, at(16, 50), 30, 'video', 70, 3.5, null, 0));
    recs.push(...session(THIS, at(weekend ? 15 : 20), weekend ? 110 : 70, 'game', 75, 11, '배틀그라운드', 38 + (6 - d) * 1.2));
    if (d % 2 === 0) recs.push(...session(THIS, at(22, 10), 40, 'music', 72, 4.5, 'Spotify', 36 + (6 - d)));
    if (d === 3) recs.push(...session(PAD, at(13), 45, 'video', 69, 3, null, 0));
  }
  const now = Date.now();
  recs.push(...session(PHONE, now - 9.5 * 3600000, 35, 'music', 74, 4, null, 0));
  recs.push(...session(THIS, now - 52 * 60000, 51, 'game', 76, 12, '배틀그라운드', 46));
  return recs.filter((r) => Date.parse(r.minute_start) < now);
}

const history = buildHistory();
let liveRecs: Rec[] = [];

const settings: Settings = {
  paused: false,
  loopbackIncludesVolume: false,
  defaultRefSplDb: 105,
  outputs: {
    'out-1': { name: '헤드폰 (Galaxy Buds3 Pro)', formFactor: 3, lastSeen: Date.now() },
    'out-2': { name: '스피커 (Realtek(R) Audio)', formFactor: 1, lastSeen: Date.now() - 86400000 },
  },
  age: 17,
  ageBand: '14-17',
  mode: 2,
  syncEnabled: true,
  syncAppNames: false,
  notify: { warn: true, rest: true, weekly: true },
  autoReduceVolume: false,
  launchAtLogin: true,
  theme: 'auto',
  accent: 'ocean',
  localOnlyChosen: false,
  notificationConsent: false,
};

const initialSettings = structuredClone(settings);
const accountSettings = new Map<string, Settings>();

let session_: AppState['session'] = { configured: false, signedIn: false, localOnly: false, user: null, recovery: false };
let demoPaused = false;
let t = 0;

const LABEL: Record<string, string> = { music: '음악', video: '영상', game: '게임', call: '통화', browser: '브라우저', other: '기타' };

function gauge(): AppState['gauge'] {
  const nowMs = Date.now();
  const now = minuteOfMs(nowMs);
  const mode = resolveMode(settings.ageBand, settings.mode);
  const allowance = weeklyAllowance(mode);
  const pct = (x: number) => (x / allowance) * 100;
  const signed = session_.signedIn;
  const all = isDemo() ? [...history, ...liveRecs] : [];
  const merged = mergeRecords(all);
  const st = integrate(merged.values(), now);
  const se = st.fast + st.slow + st.residual;
  const day0 = new Date(nowMs);
  day0.setHours(0, 0, 0, 0);
  let todaySec = 0, todayKurt = 0, total = 0, first = Infinity;
  const bands = new Array(BAND_COUNT).fill(0);
  for (const m of merged.values()) {
    if (m.minute >= minuteOfMs(day0.getTime())) { todaySec += m.listenSeconds; todayKurt += m.kurt; }
    total += m.listenSeconds;
    if (m.minute < first) first = m.minute;
    if (m.band) m.band.forEach((v, i) => (bands[i] += v));
  }
  const per = new Map<string, number>();
  for (const r of all) per.set(r.device_id, (per.get(r.device_id) ?? 0) + (r.dose_kurt ?? 0));
  const devTotal = [...per.values()].reduce((a, b) => a + b, 0);
  const devices = [...per.entries()].map(([id, v]) => {
    const d = DEVICES.find((x) => x.id === id)!;
    return { id, name: id === THIS ? `이 PC (${d.name})` : d.name, isThis: id === THIS, pct: (v / devTotal) * 100, platform: d.platform };
  }).sort((a, b) => b.pct - a.pct);
  const heat = Array.from({ length: 7 }, () => new Array(12).fill(0));
  const start = new Date(day0); start.setDate(start.getDate() - 6);
  const DOW = ['일', '월', '화', '수', '목', '금', '토'];
  const heatDays = Array.from({ length: 7 }, (_, i) => DOW[new Date(start.getTime() + i * 86400000).getDay()]);
  const todayHours = new Array<number>(24).fill(0);
  const weekDays = heatDays.map((day, i) => { const d = new Date(start); d.setDate(d.getDate() + i); return { date: `${d.getMonth()+1}/${d.getDate()}`, day, listenSec: 0 }; });
  for (const m of merged.values()) {
    const dt = new Date(m.minute * 60000);
    if (dt.getTime() >= day0.getTime()) todayHours[dt.getHours()] += m.listenSeconds;
    const di = Math.round((new Date(dt).setHours(0, 0, 0, 0) - start.getTime()) / 86400000);
    if (di >= 0 && di < 7) { heat[di][Math.floor(dt.getHours() / 2)] += m.kurt; weekDays[di].listenSec += m.listenSeconds; }
  }
  const byLabel = new Map<string, number>();
  for (const r of all) {
    const k = r.device_id === THIS ? r.app_name ?? '기타' : `다른 기기 · ${LABEL[r.content_label ?? 'other']}`;
    byLabel.set(k, (byLabel.get(k) ?? 0) + (r.dose_kurt ?? 0));
  }
  const lt = [...byLabel.values()].reduce((a, b) => a + b, 0);
  let apps = [...byLabel.entries()].map(([label, v]) => ({ label, pct: (v / lt) * 100 })).sort((a, b) => b.pct - a.pct);
  if (apps.length > 4) apps = [...apps.slice(0, 3), { label: '그 밖의 앱', pct: apps.slice(3).reduce((a, b) => a + b.pct, 0) }];
  const vt = new Map<string, { s: number; n: number }>();
  for (const r of all.filter((x) => x.device_id === THIS)) {
    const d = new Date(r.minute_start);
    const k = `${d.getMonth() + 1}/${d.getDate()}`;
    const c = vt.get(k) ?? { s: 0, n: 0 };
    c.s += r.volume_index ?? 0; c.n++;
    vt.set(k, c);
  }
  const todayByApp = new Map<string, number>();
  for (const r of all) {
    if (new Date(r.minute_start).getTime() < day0.getTime()) continue;
    const label = r.device_id === THIS ? r.app_name ?? '기타' : `다른 기기 · ${LABEL[r.content_label ?? 'other']}`;
    todayByApp.set(label, (todayByApp.get(label) ?? 0) + (r.dose_kurt ?? r.dose_eeh));
  }
  const todayTotal = [...todayByApp.values()].reduce((a, b) => a + b, 0);
  const todayApps = [...todayByApp].map(([label, value]) => ({ label, pct: todayTotal > 0 ? value / todayTotal * 100 : 0 })).sort((a, b) => b.pct - a.pct);
  const span = Math.max(1, Math.min(7, (now - first) / 1440));
  const lex8h = st.weeklyEeh > 0 ? lex8hFromWeeklyDose((st.weeklyEeh * 7) / span) : null;
  const p = projectCrossing(merged.values(), now, allowance);
  return {
    mode,
    allowancePa2h: allowance,
    safeEarPct: pct(se),
    standardPct: pct(st.weeklyEeh),
    fastPct: pct(st.fast),
    slowPct: pct(st.slow),
    residualPct: pct(st.residual),
    rest: [10, 30, 60, 120].map((min) => ({ min, pct: pct(doseAfterRest(st, min)) })),
    projection: { minute: p.minute, basisDays: p.basisDays },
    todayListenSec: todaySec,
    todayPct: pct(todayKurt),
    curve: fatigueCurve(merged.values(), minuteOfMs(day0.getTime()), now, 5).map((c) => ({ minute: c.minute, fast: pct(c.fast), slow: pct(c.slow) })),
    bands,
    bandCoverage: 1,
    devices,
    heat,
    heatDays,
    weekDays,
    todayHours,
    todayApps,
    apps,
    volumeTrend: [...vt.entries()].map(([day, x]) => ({ day, avg: x.s / x.n })),
    iso: lex8h == null ? { lex8h: null, scenarios: [] } : {
      lex8h,
      scenarios: [
        { id: 'now', deltaDb: 0, points: niptsCurve(lex8h, 0) },
        { id: 'keep', deltaDb: 0, points: niptsCurve(lex8h, 10) },
        { id: 'down', deltaDb: -3, points: niptsCurve(lex8h - 3, 10) },
      ],
    },
    overlapMinutes: 0,
  };
}

/** 지금 이 순간 게임 소리가 난다고 치고, 1분마다 레코드를 하나 더한다 */
let curGauge = gauge();
let lastMinute = minuteOfMs(Date.now());
function live(): AppState['live'] {
  if (!isDemo()) return {
    capture: { status: 'unsupported', message: '브라우저 테스트에서는 실제 소리를 측정하지 않아요.' },
    paused: settings.paused, demoPaused: false,
    volume: { available: false, deviceId: null, deviceName: null, formFactor: null, scalar: null, db: null, muted: false, sessions: [], t: Date.now() },
    output: { id: null, name: null, type: 'unknown', source: 'auto', autoType: 'unknown' },
    app: null, splA: null, dbfsA: null, beta: null, kurtWeight: 1, counting: false, calibrationId: 'none', refSplDb: 105,
  };
  const loud = isDemo() && !settings.paused && !demoPaused;
  const spl = 76 + Math.sin(t / 7) * 2.5 + (t % 9 === 0 ? 4 : 0);
  return {
    capture: !isDemo() || settings.paused ? { status: 'stopped' } : { status: 'running', sampleRate: 48000, channels: 2, method: 'demo' },
    paused: settings.paused,
    demoPaused,
    volume: { available: true, deviceId: 'out-1', deviceName: '헤드폰 (Galaxy Buds3 Pro)', formFactor: 3, scalar: 0.46, db: -13.2, muted: false, sessions: [], t: Date.now() },
    output: { id: 'out-1', name: '헤드폰 (Galaxy Buds3 Pro)', type: settings.outputs['out-1'].type ?? 'headphones', source: settings.outputs['out-1'].type ? 'user' : 'auto', autoType: 'headphones' },
    app: loud ? '배틀그라운드' : null,
    splA: loud ? spl : null,
    dbfsA: loud ? spl - 105 + 13.2 : null,
    beta: loud ? 11 + Math.sin(t / 5) * 3 : null,
    kurtWeight: loud ? Math.pow((11 + Math.sin(t / 5) * 3) / 3, 0.65) : 1,
    counting: loud && (settings.outputs['out-1'].type ?? 'headphones') !== 'speaker',
    calibrationId: 'generic-v0',
    refSplDb: settings.outputs['out-1'].refSplDb ?? 105,
  };
}

function state(): AppState {
  return {
    live: live(),
    gauge: curGauge,

    session: { ...session_, localOnly: !session_.signedIn && settings.localOnlyChosen },
    sync: { enabled: false, lastUploadAt: null, lastDownloadAt: null, pending: 0, error: null },
    settings: isDemo() ? settings : { ...settings, outputs: {} },
    version: '0.1.0 (미리보기)',
    hostname: 'NABLA-PC',
  };
}

const stateCbs: ((s: AppState) => void)[] = [];
const waveCbs: ((w: WaveChunk) => void)[] = [];
const push = () => stateCbs.forEach((cb) => cb(state()));

setInterval(() => {
  t++;
  const m = minuteOfMs(Date.now());
  if (m !== lastMinute && live().counting) {
    liveRecs.push(...session(THIS, lastMinute * 60000, 1, 'game', 76, 12, '배틀그라운드', 46));
  }
  lastMinute = m;
  curGauge = gauge();
  push();
}, 1000);

let wt = 0;
setInterval(() => {
  const L = live();
  if (!L.splA) { waveCbs.forEach((cb) => cb({ min: new Array(24).fill(0), max: new Array(24).fill(0), rmsDbfs: -120 })); return; }
  const min: number[] = [], max: number[] = [];
  for (let i = 0; i < 24; i++) {
    wt++;
    const beat = Math.exp(-((wt % 60) / 6));
    const shot = wt % 230 < 3 ? 0.75 : 0;
    const a = 0.08 + 0.12 * Math.abs(Math.sin(wt / 13)) + beat * 0.2 + shot + rnd() * 0.04;
    max.push(Math.min(1, a));
    min.push(-Math.min(1, a * (0.85 + rnd() * 0.3)));
  }
  waveCbs.forEach((cb) => cb({ min, max, rmsDbfs: -22 }));
}, 100);

const ok = <T>(data: T): Result<T> => ({ ok: true, data });
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const after = async <T>(r: Result<T>) => { await wait(350); push(); return r; };

function signIn(name: string, email: string, provider: string) {
  const key = provider === 'demo' ? 'preview-demo' : 'preview-test';
  const defaults = { ...initialSettings, ...(provider === 'demo' ? {} : { age: null, ageBand: null, mode: null }) };
  Object.assign(settings, structuredClone(accountSettings.get(key) ?? defaults));
  session_ = { configured: false, signedIn: true, localOnly: false, user: { id: provider === 'demo' ? 'preview-demo' : 'preview-test', name, email, provider }, recovery: false };
  curGauge = gauge();
}

export const demoApi: SafeEarApi & { setPaused(p: boolean): Promise<void> } = {
  getReport: async (date, view) => ok(buildReport(isDemo() ? [...history, ...liveRecs] : [], date, view, resolveMode(settings.ageBand, settings.mode))),
  getState: async () => state(),
  onState: (cb) => { stateCbs.push(cb); return () => stateCbs.splice(stateCbs.indexOf(cb), 1); },
  onWave: (cb) => { waveCbs.push(cb); return () => waveCbs.splice(waveCbs.indexOf(cb), 1); },
  onNavigate: () => () => {},
  signUp: unavailable,
  signIn: async (p) => {
    const login = p.email.trim();
    if (login !== DEMO_EMAIL && login !== 'test') return unavailable();
    if (p.password !== (login === 'test' ? 'test' : DEMO_PASSWORD)) return { ok: false, error: '이메일 또는 비밀번호가 맞지 않아요.' };
    await wait(350); signIn(login === 'test' ? '테스트 사용자' : '데모 사용자', login, login === 'test' ? 'test' : 'demo'); return after(ok(undefined));
  },
  signInWithGoogle: unavailable,
  requestNotifications: async () => {
    if (!('Notification' in window)) return ok('unsupported');
    const permission = await Notification.requestPermission();
    settings.notificationConsent = permission === 'granted';
    return ok(permission === 'granted' ? 'granted' : permission === 'denied' ? 'denied' : 'requested');
  },
  resetPassword: unavailable,
  updatePassword: unavailable,
  signOut: async () => { if (session_.user) accountSettings.set(session_.user.id, structuredClone(settings)); session_ = { ...session_, signedIn: false, user: null }; settings.localOnlyChosen = false; curGauge = gauge(); return after(ok(undefined)); },
  continueLocal: unavailable,
  deleteAccount: async () => ({ ok: false, error: '미리보기에서는 탈퇴할 수 없어요.' }),
  updateProfile: async (p) => {
    if (!session_.signedIn) return unavailable();
    if (p.age !== undefined) { settings.age = p.age; settings.ageBand = p.age < 18 ? '14-17' : p.age < 20 ? '18-19' : p.age < 30 ? '20s' : '30plus'; }
    settings.mode = resolveMode(settings.ageBand, p.mode ?? settings.mode);
    if (p.name && session_.user) session_ = { ...session_, user: { ...session_.user, name: p.name } };
    curGauge = gauge();
    return after(ok(undefined));
  },
  setSettings: async (p) => { Object.assign(settings, p); return after(ok(undefined)); },
  setOutput: async (id, p) => { settings.outputs[id] = { ...settings.outputs[id], ...p }; return after(ok(undefined)); },
  listDevices: async () => { await wait(400); return ok(isDemo() ? DEVICES : []); },
  exportData: async () => ({ ok: false, error: '미리보기에서는 파일을 내보낼 수 없어요.' }),
  clearLocalData: async () => ({ ok: false, error: '미리보기에서는 기록을 지울 수 없어요.' }),
  setDemoPlaying: async (p) => { demoPaused = p; push(); },
  openExternal: async (url) => { window.open(url, '_blank', 'noopener'); },
  setPaused: async (p) => { settings.paused = p; push(); },
};

if (!window.safeear) (window as unknown as { safeear: typeof demoApi }).safeear = demoApi;

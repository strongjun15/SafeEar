/** main ↔ 화면(UI) ↔ 엔진 사이에 오가는 데이터 형태 */
import type { AgeBand, CurvePoint, FrameFeatures, HearingMode, NiptsPoint, OutputType } from '@safeear/core';

export type CaptureStatus = 'starting' | 'running' | 'stopped' | 'error' | 'unsupported';

/** 엔진 창 → main: 상태 */
export interface EngineStatus {
  status: CaptureStatus;
  message?: string;
  sampleRate?: number;
  channels?: number;
  method?: 'displayMedia' | 'desktopUserMedia' | 'demo';
}

/** 엔진 창 → main: 1초 특징값. 원시 오디오는 들어 있지 않다 */
export interface EngineFrame {
  t: number;
  features: FrameFeatures;
}

/** 엔진 창 → main → 화면: 파형 표시용 포락선 (0.1초마다, 복원 불가능한 최소/최대값 몇 개) */
export interface WaveChunk {
  min: number[];
  max: number[];
  rmsDbfs: number;
}

export interface VolumeSession {
  pid: number;
  name: string;
  peak: number;
}

export interface VolumeSnapshot {
  available: boolean;
  error?: string;
  deviceId: string | null;
  deviceName: string | null;
  formFactor: number | null;
  scalar: number | null;
  db: number | null;
  muted: boolean;
  sessions: VolumeSession[];
  t: number;
}

export interface LiveState {
  capture: EngineStatus;
  /** 사용자가 측정을 멈췄는지 */
  paused: boolean;
  /** 「10년 뒤」 재생 중이라 분석을 잠시 멈췄는지 */
  demoPaused: boolean;
  volume: VolumeSnapshot;
  output: { id: string | null; name: string | null; type: OutputType; source: 'auto' | 'user'; autoType: OutputType };
  app: string | null;
  splA: number | null;
  dbfsA: number | null;
  beta: number | null;
  kurtWeight: number;
  /** 지금 이 초가 선량에 들어가고 있는가 */
  counting: boolean;
  calibrationId: string;
  refSplDb: number;
}

export interface DeviceShare {
  id: string;
  name: string;
  isThis: boolean;
  pct: number;
  platform: string | null;
}

export interface Scenario {
  id: 'now' | 'keep' | 'down';
  deltaDb: number;
  points: NiptsPoint[];
}

export interface GaugeView {
  mode: HearingMode;
  allowancePa2h: number;
  safeEarPct: number;
  standardPct: number;
  fastPct: number;
  slowPct: number;
  residualPct: number;
  rest: { min: number; pct: number }[];
  projection: { minute: number | null; basisDays: number };
  todayListenSec: number;
  todayPct: number;
  curve: CurvePoint[];
  bands: number[];
  bandCoverage: number;
  devices: DeviceShare[];
  heat: number[][];
  heatDays: string[];
  todayHours: number[];
  todayApps: { label: string; pct: number }[];
  weekDays: { date: string; day: string; listenSec: number }[];
  apps: { label: string; pct: number }[];
  volumeTrend: { day: string; avg: number }[];
  iso: { lex8h: number | null; scenarios: Scenario[] };
  overlapMinutes: number;
}

export interface UserInfo {
  id: string;
  email: string | null;
  name: string;
  provider: string;
}

export interface SessionView {
  configured: boolean;
  signedIn: boolean;
  localOnly: boolean;
  user: UserInfo | null;
  recovery: boolean;
}

export interface SyncView {
  enabled: boolean;
  lastUploadAt: number | null;
  lastDownloadAt: number | null;
  pending: number;
  error: string | null;
}

export interface OutputSetting {
  name: string;
  formFactor: number | null;
  type?: OutputType;
  refSplDb?: number;
  lastSeen: number;
}

export interface Settings {
  paused: boolean;
  loopbackIncludesVolume: boolean;
  defaultRefSplDb: number;
  outputs: Record<string, OutputSetting>;
  age: number | null;
  ageBand: AgeBand | null;
  mode: HearingMode | null;
  syncEnabled: boolean;
  syncAppNames: boolean;
  notify: { warn: boolean; rest: boolean; weekly: boolean };
  autoReduceVolume: boolean;
  launchAtLogin: boolean;
  theme: 'auto' | 'light' | 'dark';
  accent: 'ocean' | 'forest' | 'sunset' | 'violet';
  localOnlyChosen: boolean;
  notificationConsent: boolean;
}

export interface AppState {
  live: LiveState;
  gauge: GaugeView;
  session: SessionView;
  sync: SyncView;
  settings: Settings;
  version: string;
  hostname: string;
}

export interface RemoteDevice {
  id: string;
  name: string;
  platform: string | null;
  last_seen_at: string | null;
}

/** 화면에서 main으로 보내는 결과 */
export type Result<T = void> = { ok: true; data: T } | { ok: false; error: string };

export interface ReportView {
  burdenTotals: number[];
  start: string;
  end: string;
  labels: string[];
  totals: number[];
  apps: { label: string; pct: number }[];
  volumeTrend: { day: string; avg: number }[];
}

export interface SafeEarApi {
  getReport(date: string, view: 'day' | 'week'): Promise<Result<ReportView>>;
  getState(): Promise<AppState>;
  onState(cb: (s: AppState) => void): () => void;
  onWave(cb: (w: WaveChunk) => void): () => void;
  onNavigate(cb: (tab: string) => void): () => void;
  signUp(p: { name: string; username: string; email: string; password: string; age: number; marketing: boolean }): Promise<Result<{ needsConfirm: boolean }>>;
  signIn(p: { email: string; password: string }): Promise<Result>;
  signInWithGoogle(): Promise<Result>;
  requestNotifications(): Promise<Result<'granted' | 'denied' | 'unsupported' | 'requested'>>;
  resetPassword(email: string): Promise<Result>;
  updatePassword(password: string): Promise<Result>;
  signOut(): Promise<Result>;
  continueLocal(): Promise<Result>;
  deleteAccount(): Promise<Result>;
  updateProfile(p: { name?: string; age?: number; ageBand?: AgeBand | null; mode?: HearingMode | null }): Promise<Result>;
  setSettings(p: Partial<Settings>): Promise<Result>;
  setOutput(id: string, p: Partial<Pick<OutputSetting, 'type' | 'refSplDb'>>): Promise<Result>;
  listDevices(): Promise<Result<RemoteDevice[]>>;
  exportData(): Promise<Result<string | null>>;
  clearLocalData(): Promise<Result>;
  setDemoPlaying(playing: boolean): Promise<void>;
  openExternal(url: string): Promise<void>;
}

/**
 * SafeEar 윈도우 수집기 — main 프로세스.
 *
 *   [엔진 창 (숨김)]  시스템 소리(WASAPI loopback) → 1초 특징값  ──IPC──┐
 *   [볼륨 도우미]     마스터 볼륨 · 출력 장치 종류 · 재생 중인 앱  ───────┤
 *                                                                      ▼
 *   [main]  SPL 추정 → 1초 선량 → 1분 레코드 → 로컬 저장 → (로그인 시) 동기화
 *           게이지 계산 → 화면 · 트레이 · 알림
 *
 * 창을 닫아도 트레이에서 계속 측정한다. 원시 오디오는 엔진 창 밖으로 나오지 않는다 (계획서 13.8절).
 */
import {
  BrowserWindow,
  Menu,
  Notification,
  Tray,
  app,
  desktopCapturer,
  dialog,
  ipcMain,
  nativeImage,
  session,
  shell,
  type IpcMainInvokeEvent,
} from 'electron';
import { writeFileSync } from 'node:fs';
import { hostname } from 'node:os';
import { join } from 'node:path';
import { resolveMode, type AgeBand, type HearingMode } from '@safeear/core';
import type { AppState, EngineFrame, EngineStatus, Result, Settings, WaveChunk } from '../shared/types';
import { AuthService, koreanAuthError } from './auth';
import { GaugeService } from './gauges';
import { Meter } from './meter';
import { Notifier } from './notifier';
import { SettingsStore } from './settings';
import { DeviceIds, RecordStore, SyncCursor } from './store';
import { SyncService } from './sync';
import { VolumeHelper } from './volume';

const VERSION = app.getVersion();
const startHidden = process.argv.includes('--hidden');

app.setAppUserModelId('kr.hs.gbs.nabla.safeear');
if (!app.requestSingleInstanceLock()) {
  app.quit();
}

let ui: BrowserWindow | null = null;
let engine: BrowserWindow | null = null;
let tray: Tray | null = null;
let quitting = false;
let trayHintShown = false;

const asset = (name: string) => join(__dirname, 'assets', name);

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);

  const settings = new SettingsStore();
  const store = new RecordStore();
  const ids = new DeviceIds();
  const cursor = new SyncCursor();
  const volume = new VolumeHelper();
  const auth = new AuthService();

  const ownPids = () => new Set(app.getAppMetrics().map((m) => m.pid));
  const meter = new Meter({ settings, volume, ownPids, deviceId: () => ids.for(auth.userId), appVersion: VERSION });
  const sync = new SyncService(auth, store, settings, ids, cursor, VERSION);
  const gauges = new GaugeService({
    store,
    settings,
    meter,
    ownerId: () => auth.userId,
    thisDeviceIds: () => [ids.for(auth.userId), ids.for(null)],
    remoteRecords: () => (auth.userId ? sync.remote : []),
    remoteDevices: () => sync.devices,
  });
  const notifier = new Notifier(settings, volume, (tab) => showUi(tab));

  meter.on('record', (rec) => {
    store.append({ ...rec, owner_id: auth.userId });
    gauges.invalidate();
  });
  sync.on('remote', () => gauges.invalidate());

  volume.start();
  await auth.init();
  auth.on('focus', () => showUi());
  auth.on('change', async () => {
    gauges.invalidate();
    await stopCapture();
    if (auth.userId) { await pullProfile(); await startCapture(); }
    pushState();
  });

  /** 로그인하면 서버 프로필(나이대·모드)과 이 기기 설정을 맞춘다 */
  async function pullProfile(): Promise<void> {
    const p = await auth.loadProfile();
    const rawAge = auth.session?.user.user_metadata?.age;
    const age = Number.isInteger(rawAge) && rawAge >= 14 && rawAge <= 120 ? rawAge as number : null;
    const ageBand: AgeBand | null = age == null ? null : age < 18 ? '14-17' : age < 20 ? '18-19' : age < 30 ? '20s' : '30plus';
    const mode = resolveMode(ageBand, age != null && age >= 18 ? p?.hearing_mode ?? 2 : 2);
    settings.update({ age, ageBand, mode });
    if (!p && age != null) await auth.saveProfile({ age_band: ageBand, hearing_mode: mode }).catch(() => undefined);
  }
  if (auth.userId) void pullProfile();

  sync.start();
  applyLoginItem(settings.value.launchAtLogin);

  // ---------- 엔진 창 (숨김) ----------
  const engineSession = session.fromPartition('safeear-engine');
  const mediaPerm = (perm: string) => perm === 'media' || perm === 'display-capture';
  engineSession.setPermissionRequestHandler((_wc, perm, cb) => cb(mediaPerm(perm)));
  engineSession.setPermissionCheckHandler((_wc, perm) => mediaPerm(perm));
  engineSession.setDisplayMediaRequestHandler((_req, cb) => {
    desktopCapturer
      .getSources({ types: ['screen'], thumbnailSize: { width: 0, height: 0 } })
      .then((sources) => (sources[0] ? cb({ video: sources[0], audio: 'loopback' }) : cb({})))
      .catch(() => cb({}));
  });

  function createEngine(): void {
    engine = new BrowserWindow({
      show: false,
      width: 320,
      height: 240,
      skipTaskbar: true,
      webPreferences: {
        session: engineSession,
        preload: join(__dirname, 'preload-engine.cjs'),
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
        backgroundThrottling: false,
        autoplayPolicy: 'no-user-gesture-required',
      },
    });
    engine.webContents.on('did-finish-load', () => void startCapture());
    engine.webContents.on('render-process-gone', () => {
      engine = null;
      meter.setCaptureStatus({ status: 'error', message: '분석 엔진이 멈춰서 다시 시작해요' });
      setTimeout(createEngine, 3000);
    });
    void engine.loadFile(join(__dirname, 'engine', 'engine.html'));
  }

  async function startCapture(): Promise<void> {
    if (!engine || settings.value.paused) return;
    if (!auth.userId) return;
    if (process.platform !== 'win32') {
      meter.setCaptureStatus({ status: 'unsupported', message: '시스템 소리 캡처는 윈도우에서만 돼요' });
      return;
    }
    const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 0, height: 0 } }).catch(() => []);
    const sourceId = sources[0]?.id ?? '';
    // getDisplayMedia는 사용자 동작이 있어야 열리는 경우가 있어 userGesture=true로 실행한다
    await engine.webContents.executeJavaScript(`window.safeearEngine && window.safeearEngine.start(${JSON.stringify(sourceId)})`, true).catch((e) => {
      meter.setCaptureStatus({ status: 'error', message: String(e) });
    });
  }

  async function stopCapture(): Promise<void> {
    await engine?.webContents.executeJavaScript('window.safeearEngine && window.safeearEngine.stop()', true).catch(() => undefined);
    meter.setCaptureStatus({ status: 'stopped' });
  }

  const fromEngine = (e: Electron.IpcMainEvent) => !!engine && e.sender === engine.webContents;
  ipcMain.on('engine:frame', (e, f: EngineFrame) => {
    if (fromEngine(e) && auth.userId) meter.onFrame(f.features, f.t);
  });
  ipcMain.on('engine:status', (e, s: EngineStatus) => {
    if (!fromEngine(e)) return;
    meter.setCaptureStatus(s);
    if (s.status === 'error' && !settings.value.paused) setTimeout(() => void startCapture(), 5000);
  });
  ipcMain.on('engine:wave', (e, w: WaveChunk) => {
    if (fromEngine(e) && ui && ui.isVisible() && !ui.isMinimized()) ui.webContents.send('wave', w);
  });

  createEngine();

  // ---------- 화면 창 ----------
  function showUi(tab?: string): void {
    if (ui) {
      if (ui.isMinimized()) ui.restore();
      ui.show();
      ui.focus();
      if (tab) ui.webContents.send('navigate', tab);
      return;
    }
    ui = new BrowserWindow({
      width: 440,
      height: 900,
      minWidth: 380,
      minHeight: 640,
      title: 'SafeEar',
      icon: asset('icon.png'),
      backgroundColor: '#EDF1F8',
      show: false,
      webPreferences: {
        preload: join(__dirname, 'preload-ui.cjs'),
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
      },
    });
    ui.webContents.setWindowOpenHandler(({ url }) => {
      if (/^https:\/\//.test(url)) void shell.openExternal(url);
      return { action: 'deny' };
    });
    ui.webContents.on('will-navigate', (ev) => ev.preventDefault());
    ui.once('ready-to-show', () => {
      ui?.show();
      if (tab) ui?.webContents.send('navigate', tab);
    });
    ui.on('close', () => {
      if (!quitting && !trayHintShown) {
        trayHintShown = true;
        tray?.displayBalloon?.({
          title: 'SafeEar는 계속 측정 중이에요',
          content: '알림 영역(트레이)의 SafeEar 아이콘에서 다시 열거나 끌 수 있어요.',
          iconType: 'info',
        });
      }
    });
    ui.on('closed', () => {
      ui = null;
    });
    void ui.loadFile(join(__dirname, 'ui', 'index.html'));
  }

  app.on('second-instance', () => showUi());

  // ---------- 트레이 ----------
  function trayMenu(): Menu {
    const paused = settings.value.paused;
    return Menu.buildFromTemplate([
      { label: 'SafeEar 열기', click: () => showUi() },
      { label: paused ? '측정 다시 시작' : '측정 일시정지', click: () => void setPaused(!paused) },
      { type: 'separator' },
      {
        label: '윈도우 시작 시 자동 실행',
        type: 'checkbox',
        checked: settings.value.launchAtLogin,
        click: (item) => {
          settings.update({ launchAtLogin: item.checked });
          applyLoginItem(item.checked);
        },
      },
      { type: 'separator' },
      { label: '종료', click: () => app.quit() },
    ]);
  }

  function refreshTray(): void {
    if (!tray) return;
    const g = gauges.view;
    const st = settings.value.paused ? '측정 일시정지' : meter.live.capture.status === 'running' ? '측정 중' : '측정 준비 중';
    tray.setToolTip(`SafeEar · 최근 7일 ${Math.round(g.safeEarPct)}% · ${st}`);
    tray.setImage(nativeImage.createFromPath(asset(settings.value.paused ? 'tray-paused.png' : 'tray.png')));
    tray.setContextMenu(trayMenu());
  }

  tray = new Tray(nativeImage.createFromPath(asset('tray.png')));
  tray.on('click', () => showUi());
  refreshTray();

  async function setPaused(paused: boolean): Promise<void> {
    settings.update({ paused });
    if (paused) await stopCapture();
    else await startCapture();
    refreshTray();
    pushState();
  }

  // ---------- 상태 전송 ----------
  function buildState(): AppState {
    return {
      live: meter.live,
      gauge: gauges.view,
      session: auth.view(settings.value.localOnlyChosen),
      sync: { ...sync.view, enabled: settings.value.syncEnabled },
      settings: settings.value,
      version: VERSION,
      hostname: hostname(),
    };
  }

  function pushState(): void {
    if (ui && !ui.isDestroyed()) ui.webContents.send('state', buildState());
  }

  let tickN = 0;
  setInterval(() => {
    meter.tick();
    gauges.compute();
    notifier.check(gauges.view, meter.live);
    if (tickN++ % 5 === 0) refreshTray();
    pushState();
  }, 1000);

  // ---------- 화면 → main 요청 ----------
  const fromUi = (e: IpcMainInvokeEvent) => !!ui && e.sender === ui.webContents;
  function handle<A extends unknown[], T>(channel: string, fn: (...args: A) => Promise<T> | T): void {
    ipcMain.handle(channel, async (e, ...args: unknown[]): Promise<Result<T>> => {
      if (!fromUi(e)) return { ok: false, error: 'forbidden' };
      try {
        const data = await fn(...(args as A));
        pushState();
        return { ok: true, data };
      } catch (err) {
        return { ok: false, error: koreanAuthError(err) };
      }
    });
  }

  ipcMain.handle('api:getState', (e) => (fromUi(e) ? buildState() : null));
  handle('api:getReport', (date: string, view: 'day' | 'week') => {
    if (!auth.userId) throw new Error('로그인이 필요해요.');
    return gauges.report(date, view);
  });
  handle('api:signUp', (p: { name: string; username: string; email: string; password: string; age: number; marketing: boolean }) => auth.signUp(p));
  handle('api:signIn', (p: { email: string; password: string }) => auth.signIn(p.email, p.password));
  handle('api:signInWithGoogle', () => auth.signInWithGoogle());
  handle('api:requestNotifications', () => {
    if (!auth.userId) throw new Error('로그인이 필요해요.');
    if (!Notification.isSupported()) return 'unsupported';
    settings.update({ notificationConsent: true });
    const n = new Notification({ title: 'SafeEar 알림', body: '사용량 경고와 회복 안내를 알려드릴게요.' });
    n.show();
    return 'requested';
  });
  handle('api:resetPassword', (email: string) => auth.resetPassword(email));
  handle('api:updatePassword', (pw: string) => auth.updatePassword(pw));
  handle('api:signOut', async () => {
    await auth.signOut();
    settings.update({ localOnlyChosen: false });
  });
  handle('api:continueLocal', () => {
    throw new Error('로그인이 필요해요.');
  });
  handle('api:deleteAccount', async () => {
    const r = await dialog.showMessageBox(ui!, {
      type: 'warning',
      buttons: ['취소', '탈퇴하고 서버 기록 삭제'],
      defaultId: 0,
      cancelId: 0,
      title: '회원 탈퇴',
      message: '계정과 서버에 올라간 모든 청취 기록을 지울까요?',
      detail: '이 PC 안의 기록은 남아 있어요. 프로필 화면의 「이 PC 기록 지우기」로 따로 지울 수 있어요.',
    });
    if (r.response !== 1) throw new Error('취소했어요.');
    await auth.deleteAccount();
    settings.update({ localOnlyChosen: false });
  });
  handle('api:updateProfile', async (p: { name?: string; age?: number; ageBand?: AgeBand | null; mode?: HearingMode | null }) => {
    const s = settings.value;
    if (!auth.userId) throw new Error('로그인이 필요해요.');
    const age = p.age ?? s.age;
    if (age == null || !Number.isInteger(age) || age < 14 || age > 120) throw new Error('나이는 만 14~120세로 입력해 주세요.');
    const ageBand: AgeBand = age < 18 ? '14-17' : age < 20 ? '18-19' : age < 30 ? '20s' : '30plus';
    const mode = resolveMode(ageBand, p.mode !== undefined ? p.mode : s.mode);
    await auth.saveAge(age);
    settings.update({ age, ageBand, mode });
    gauges.invalidate();
    if (auth.userId) {
      await auth.saveProfile({
        ...(p.name !== undefined ? { display_name: p.name } : {}),
        age_band: ageBand,
        hearing_mode: mode,
      });
    }
  });
  handle('api:setSettings', async (p: Partial<Settings>) => {
    const allowed: (keyof Settings)[] = [
      'loopbackIncludesVolume',
      'defaultRefSplDb',
      'syncAppNames',
      'launchAtLogin',
      'theme',
      'accent',
    ];
    const patch: Partial<Settings> = {};
    for (const k of allowed) if (k in p) (patch as Record<string, unknown>)[k] = p[k];
    settings.update(patch);
    if ('launchAtLogin' in patch) applyLoginItem(!!patch.launchAtLogin);
    if ('syncEnabled' in patch) void sync.kick();
    if ('paused' in p) await setPaused(!!p.paused);
    gauges.invalidate();
    refreshTray();
  });
  handle('api:setOutput', (id: string, p: { type?: Settings['outputs'][string]['type']; refSplDb?: number }) => {
    const cur = settings.value.outputs[id];
    if (!cur) throw new Error('알 수 없는 출력 장치예요.');
    const next = { ...cur };
    if ('type' in p) next.type = p.type;
    if ('refSplDb' in p) next.refSplDb = p.refSplDb != null && Number.isFinite(p.refSplDb) ? Math.max(70, Math.min(140, p.refSplDb)) : undefined;
    settings.update({ outputs: { ...settings.value.outputs, [id]: next } });
  });
  handle('api:listDevices', async () => {
    await sync.download();
    return sync.devices;
  });
  handle('api:exportData', async () => {
    const r = await dialog.showSaveDialog(ui!, {
      title: '내 기록 내보내기',
      defaultPath: `safeear-records-${new Date().toISOString().slice(0, 10)}.json`,
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (r.canceled || !r.filePath) return null;
    writeFileSync(
      r.filePath,
      JSON.stringify({ exportedAt: new Date().toISOString(), app: 'SafeEar', version: VERSION, records: store.all() }, null, 1),
    );
    return r.filePath;
  });
  handle('api:clearLocalData', async () => {
    const r = await dialog.showMessageBox(ui!, {
      type: 'warning',
      buttons: ['취소', '지우기'],
      defaultId: 0,
      cancelId: 0,
      title: '이 PC 기록 지우기',
      message: '이 PC에 저장된 1분 요약 기록을 모두 지울까요?',
      detail: '서버에 이미 올라간 기록은 지워지지 않아요.',
    });
    if (r.response !== 1) throw new Error('취소했어요.');
    store.clear();
    cursor.reset();
    gauges.invalidate();
  });
  ipcMain.handle('api:setDemoPlaying', (e, playing: boolean) => {
    if (fromUi(e)) meter.setDemoPaused(!!playing);
  });
  ipcMain.handle('api:openExternal', (e, url: string) => {
    if (fromUi(e) && /^https:\/\//.test(url)) void shell.openExternal(url);
  });
  ipcMain.handle('api:setPaused', async (e, paused: boolean) => {
    if (fromUi(e)) await setPaused(!!paused);
  });

  if (!startHidden) showUi();

  app.on('before-quit', () => {
    quitting = true;
    const rec = meter.flush();
    if (rec) store.append({ ...rec, owner_id: auth.userId });
    volume.stop();
    auth.stop();
    sync.stop();
    void sync.upload();
  });
});

app.on('window-all-closed', () => {
  /* 트레이에서 계속 실행 */
});

function applyLoginItem(enabled: boolean): void {
  if (!app.isPackaged) return; // 개발 중에는 electron.exe를 시작 프로그램에 넣지 않는다
  app.setLoginItemSettings({ openAtLogin: enabled, args: ['--hidden'] });
}

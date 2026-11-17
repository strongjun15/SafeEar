/**
 * 마스터 볼륨 · 출력 장치 종류 · 지금 소리를 내는 앱을 읽는다.
 *
 * [macOS] osascript로 볼륨(0~100)을 1.5초마다, system_profiler로 기본 출력 장치를 15초마다 읽는다.
 *         소리를 내는 앱 목록은 맥에서 얻을 방법이 없어 비워 둔다.
 *
 * [윈도우]
 * native/win-audio-helper.ps1 이 Core Audio(IAudioEndpointVolume, IAudioSessionManager2)를 호출해
 * 1초마다 JSON 한 줄을 내보낸다. 네이티브 모듈을 빌드하지 않아도 되도록 윈도우에 기본으로 있는
 * PowerShell을 쓴다.
 */
import { app } from 'electron';
import { execFile, spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import type { OutputType } from '@safeear/core';
import type { VolumeSnapshot } from '../shared/types';

const EMPTY: VolumeSnapshot = {
  available: false,
  deviceId: null,
  deviceName: null,
  formFactor: null,
  scalar: null,
  db: null,
  muted: false,
  sessions: [],
  t: 0,
};

/**
 * PKEY_AudioEndpoint_FormFactor → 출력 종류.
 * 0 원격, 1 스피커, 2 라인, 3 헤드폰, 4 마이크, 5 헤드셋, 6 핸드셋, 7 디지털, 8 S/PDIF, 9 HDMI 디스플레이, 10 미상
 * ⚠ 내장 사운드카드는 이어폰을 꽂아도 "스피커"로 보고하는 경우가 많다 → 사용자가 바꿀 수 있게 한다.
 */
export function outputTypeFromFormFactor(ff: number | null): OutputType {
  if (ff === 3 || ff === 5 || ff === 6) return 'headphones';
  if (ff === 1 || ff === 2 || ff === 8 || ff === 9) return 'speaker';
  return 'unknown';
}

const run = (cmd: string, args: string[], timeout = 5000) =>
  new Promise<string>((res, rej) => execFile(cmd, args, { timeout, maxBuffer: 4 << 20 }, (e, out) => (e ? rej(e) : res(String(out)))));

/**
 * 맥 출력 장치 → 윈도우 FormFactor 번호 (outputTypeFromFormFactor를 그대로 쓰려고)
 * 블루투스는 대부분 이어폰이라 헤드폰으로 본다. 틀리면 오늘 화면에서 사용자가 바꾼다.
 */
export function macFormFactor(transport: string, text: string): number {
  if (/headphone|headset|earphone|airpods|buds|beats|이어폰|헤드폰|헤드셋/i.test(text)) return 3;
  if (/bluetooth/i.test(transport)) return 3;
  if (/hdmi|displayport/i.test(transport)) return 9;
  if (/airplay/i.test(transport)) return 1;
  if (/builtin/i.test(transport)) return 1;
  return 10;
}

/** 맥 볼륨(0~1, 들리는 크기 기준 눈금) → 대략의 dB. 오디오 테이퍼(진폭 ∝ 눈금²)로 본다. 교정이 필요한 값 */
export const macScalarToDb = (v: number): number => (v <= 0 ? -96 : Math.max(-96, 40 * Math.log10(v)));

export class VolumeHelper extends EventEmitter {
  state: VolumeSnapshot = { ...EMPTY };
  private proc: ChildProcessWithoutNullStreams | null = null;
  private restarts = 0;
  private stopped = false;
  private restartTimer: NodeJS.Timeout | null = null;
  private macTimer: NodeJS.Timeout | null = null;
  private macDev: { id: string | null; name: string | null; ff: number | null; at: number } = { id: null, name: null, ff: null, at: 0 };

  private scriptPath(): string {
    return app.isPackaged
      ? join(process.resourcesPath, 'native', 'win-audio-helper.ps1')
      : join(app.getAppPath(), 'native', 'win-audio-helper.ps1');
  }

  start(): void {
    if (process.env.SAFEEAR_DEMO_AUDIO === '1') {
      const demo = () => {
        this.state = { available: true, deviceId: 'demo-output', deviceName: '데모 이어폰', formFactor: 3, scalar: 0.5, db: -10, muted: false, sessions: [{ pid: 1, name: 'Demo Player', peak: 0.5 }], t: Date.now() };
        this.emit('update', this.state);
      };
      demo();
      this.restartTimer = setInterval(demo, 1000) as unknown as NodeJS.Timeout;
      return;
    }
    if (process.platform === 'darwin') {
      this.startMac();
      return;
    }
    if (process.platform !== 'win32') {
      this.state = { ...EMPTY, error: '윈도우와 macOS에서만 볼륨을 읽을 수 있어요' };
      return;
    }
    this.stopped = false;
    const proc = spawn(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', this.scriptPath()],
      { windowsHide: true },
    );
    this.proc = proc;
    createInterface({ input: proc.stdout }).on('line', (line) => this.onLine(line));
    let errText = '';
    proc.stderr.on('data', (d) => {
      errText = (errText + String(d)).slice(-2000);
    });
    proc.on('exit', (code) => {
      this.proc = null;
      if (this.stopped) return;
      console.warn('[volume] helper exited', code, errText.trim());
      this.state = { ...this.state, available: false, error: errText.trim().split('\n').pop() || `helper exit ${code}` };
      this.emit('update', this.state);
      const delay = Math.min(60_000, 2000 * Math.pow(2, this.restarts++));
      this.restartTimer = setTimeout(() => this.start(), delay);
    });
  }

  private onLine(line: string): void {
    let msg: any;
    try {
      msg = JSON.parse(line);
    } catch {
      return;
    }
    if (!msg.ok) {
      this.state = { ...EMPTY, error: msg.error ?? 'unknown', t: Date.now() };
    } else {
      this.restarts = 0;
      this.state = {
        available: true,
        deviceId: msg.device?.id ?? null,
        deviceName: msg.device?.name ?? null,
        formFactor: typeof msg.device?.formFactor === 'number' ? msg.device.formFactor : null,
        scalar: typeof msg.volume?.scalar === 'number' ? msg.volume.scalar : null,
        db: typeof msg.volume?.db === 'number' ? msg.volume.db : null,
        muted: !!msg.volume?.muted,
        sessions: Array.isArray(msg.sessions) ? msg.sessions : [],
        t: Date.now(),
      };
    }
    this.emit('update', this.state);
  }

  /* ---------- macOS ---------- */
  private startMac(): void {
    this.stopped = false;
    const tick = async () => {
      if (this.stopped) return;
      try {
        if (Date.now() - this.macDev.at > 15_000) await this.readMacDevice();
        const out = await run('osascript', ['-e', 'get volume settings']);
        const m = /output volume:(\d+)/.exec(out);
        const scalar = m ? Number(m[1]) / 100 : null; // HDMI처럼 볼륨이 없는 장치는 "missing value"
        this.state = {
          available: true,
          deviceId: this.macDev.id,
          deviceName: this.macDev.name,
          formFactor: this.macDev.ff,
          scalar,
          db: scalar == null ? null : macScalarToDb(scalar),
          muted: /output muted:true/.test(out),
          sessions: [],
          t: Date.now(),
        };
      } catch (e) {
        this.state = { ...EMPTY, error: e instanceof Error ? e.message : String(e), t: Date.now() };
      }
      this.emit('update', this.state);
      if (!this.stopped) this.macTimer = setTimeout(() => void tick(), 1500);
    };
    void tick();
  }

  private async readMacDevice(): Promise<void> {
    this.macDev.at = Date.now();
    try {
      const j = JSON.parse(await run('system_profiler', ['SPAudioDataType', '-json'], 10_000));
      const items: any[] = (j.SPAudioDataType ?? []).flatMap((x: any) => x._items ?? []);
      const d = items.find((i) => i.coreaudio_default_audio_output_device === 'spaudio_yes');
      if (!d) { this.macDev = { id: null, name: null, ff: null, at: Date.now() }; return; }
      const name = String(d._name ?? '출력 장치');
      const transport = String(d.coreaudio_device_transport ?? '');
      this.macDev = { id: `mac:${name}`, name, ff: macFormFactor(transport, `${name} ${d.coreaudio_output_source ?? ''}`), at: Date.now() };
    } catch {
      /* 장치 이름을 못 읽어도 볼륨은 계속 읽는다 */
    }
  }

  /** 마스터 볼륨 설정 (0~1) — H.870 "경고를 확인하지 않으면 볼륨 자동 감소" 옵션에서만 사용 */
  setVolume(scalar: number): void {
    const v = Math.max(0, Math.min(1, scalar));
    if (process.platform === 'darwin') {
      void run('osascript', ['-e', `set volume output volume ${Math.round(v * 100)}`]).catch(() => undefined);
      return;
    }
    this.proc?.stdin.write(`setvol ${v.toFixed(3)}\n`);
  }

  stop(): void {
    this.stopped = true;
    if (this.macTimer) clearTimeout(this.macTimer);
    if (this.restartTimer) clearTimeout(this.restartTimer);
    if (this.restartTimer) clearInterval(this.restartTimer);
    this.proc?.kill();
    this.proc = null;
  }
}

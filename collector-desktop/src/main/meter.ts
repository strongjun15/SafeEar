/**
 * 측정 파이프라인 (main 프로세스). 엔진 창이 보낸 1초 특징값(모양)에 볼륨·교정 프로필(크기)을 합쳐
 * 1초 선량을 만들고, 1분 레코드로 모은다. 계획서 2.1절 [A], 13.3절.
 */
import { EventEmitter } from 'node:events';
import {
  DEFAULT_CALIBRATION,
  DEFAULT_KURTOSIS,
  KurtosisWindow,
  MinuteAggregator,
  estimateSplA,
  kurtosisWeight,
  msToDbfs,
  pa2FromDb,
  type FrameFeatures,
  type MinuteDose,
  type MinuteRecord,
  type OutputType,
} from '@safeear/core';
import type { EngineStatus, LiveState } from '../shared/types';
import type { SettingsStore } from './settings';
import { outputTypeFromFormFactor, type VolumeHelper } from './volume';

/** 이 값보다 작은 추정 SPL은 사실상 들리지 않는 소리로 보고 청취 시간에서 뺀다 */
const AUDIBLE_FLOOR_DBA = 25;

export interface MeterDeps {
  settings: SettingsStore;
  volume: VolumeHelper;
  ownPids: () => Set<number>;
  deviceId: () => string;
  appVersion: string;
}

export class Meter extends EventEmitter {
  private readonly kurt = new KurtosisWindow(DEFAULT_KURTOSIS);
  private readonly agg: MinuteAggregator;
  private lastFrameAt = 0;
  private outputsSavedAt = 0;
  live: LiveState;

  constructor(private readonly d: MeterDeps) {
    super();
    this.agg = new MinuteAggregator({
      deviceId: d.deviceId,
      calibration: () => this.calibration(),
      appVersion: d.appVersion,
    });
    this.live = {
      capture: { status: 'starting' },
      paused: d.settings.value.paused,
      demoPaused: false,
      volume: d.volume.state,
      output: { id: null, name: null, type: 'unknown', source: 'auto', autoType: 'unknown' },
      app: null,
      splA: null,
      dbfsA: null,
      beta: null,
      kurtWeight: 1,
      counting: false,
      calibrationId: DEFAULT_CALIBRATION.id,
      refSplDb: d.settings.value.defaultRefSplDb,
    };
  }

  setCaptureStatus(s: EngineStatus): void {
    this.live = { ...this.live, capture: s };
  }

  setDemoPaused(v: boolean): void {
    this.live = { ...this.live, demoPaused: v };
  }

  private resolveOutput() {
    const s = this.d.settings.value;
    const vol = this.d.volume.state;
    const id = vol.deviceId;
    const autoType: OutputType = vol.available ? outputTypeFromFormFactor(vol.formFactor) : 'unknown';
    const saved = id ? s.outputs[id] : undefined;
    const name = vol.deviceName ?? id;
    if (id && name && (!saved || saved.name !== name || Date.now() - this.outputsSavedAt > 3600_000)) {
      s.outputs[id] = { ...(saved ?? {}), name, formFactor: vol.formFactor, lastSeen: Date.now() };
      this.outputsSavedAt = Date.now();
      this.d.settings.save();
    }
    return {
      id,
      name: vol.deviceName,
      autoType,
      type: saved?.type ?? autoType,
      source: (saved?.type ? 'user' : 'auto') as 'user' | 'auto',
      refSplDb: saved?.refSplDb ?? s.defaultRefSplDb,
    };
  }

  private calibration() {
    const out = this.resolveOutput();
    const custom = out.refSplDb !== DEFAULT_CALIBRATION.refSplDb;
    return {
      id: custom ? `user-ref${out.refSplDb}` : DEFAULT_CALIBRATION.id,
      refSplDb: out.refSplDb,
      uncertaintyDb: custom ? 6 : DEFAULT_CALIBRATION.uncertaintyDb,
    };
  }

  private topApp(): string | null {
    const own = this.d.ownPids();
    let best: { name: string; peak: number } | null = null;
    for (const s of this.d.volume.state.sessions) {
      if (own.has(s.pid)) continue;
      if (!best || s.peak > best.peak) best = s;
    }
    return best?.name ?? null;
  }

  /** 엔진 창에서 1초 프레임이 도착했을 때 */
  onFrame(f: FrameFeatures, t: number): void {
    if (this.d.settings.value.paused) return;
    this.lastFrameAt = Date.now();
    const s = this.d.settings.value;
    const vol = this.d.volume.state;
    const out = this.resolveOutput();
    const cal = this.calibration();
    const splA = estimateSplA(
      f.msA,
      { volumeDb: vol.available && vol.db != null ? vol.db : 0, muted: vol.muted },
      cal,
      s.loopbackIncludesVolume,
    );
    const beta = this.kurt.push(t, f.moments, f.msZ);
    const w = kurtosisWeight(beta);
    const audible = !this.live.demoPaused && splA != null && splA >= AUDIBLE_FLOOR_DBA && f.msZ > DEFAULT_KURTOSIS.silenceMs;
    const app = audible ? this.topApp() : null;
    const rec = this.agg.add({
      t,
      audible,
      outputType: out.type,
      outputId: out.id,
      pa2: audible ? pa2FromDb(splA!) : 0,
      kurtWeight: w,
      beta,
      bandFrac: f.msA > 0 ? f.bandMsA.map((b) => b / f.msA) : null,
      volumeIndex: vol.scalar != null ? vol.scalar * 100 : null,
      app,
      tier: 'B',
    });
    if (rec) this.emit('record', rec);
    this.live = {
      ...this.live,
      volume: vol,
      output: { id: out.id, name: out.name, type: out.type, source: out.source, autoType: out.autoType },
      app,
      splA: audible ? splA : null,
      dbfsA: Number.isFinite(msToDbfs(f.msA)) ? msToDbfs(f.msA) : null,
      beta: audible ? beta : null,
      kurtWeight: audible ? w : 1,
      counting: audible && out.type !== 'speaker',
      calibrationId: cal.id,
      refSplDb: cal.refSplDb,
    };
  }

  /** 1초마다 호출. 프레임이 끊기면(무음 구간에 캡처 데이터가 안 오는 경우) 무음으로 처리해 분을 마감한다 */
  tick(): void {
    this.live = { ...this.live, paused: this.d.settings.value.paused, volume: this.d.volume.state };
    if (Date.now() - this.lastFrameAt > 2500) {
      const out = this.resolveOutput();
      const rec = this.agg.add({
        t: Date.now(),
        audible: false,
        outputType: out.type,
        outputId: out.id,
        pa2: 0,
        kurtWeight: 1,
        beta: null,
        bandFrac: null,
        volumeIndex: null,
        app: null,
        tier: 'B',
      });
      if (rec) this.emit('record', rec);
      this.live = {
        ...this.live,
        output: { id: out.id, name: out.name, type: out.type, source: out.source, autoType: out.autoType },
        splA: null,
        beta: null,
        kurtWeight: 1,
        counting: false,
        app: null,
      };
    }
  }

  partial(): MinuteDose | null {
    return this.agg.partial();
  }

  partialListenSeconds(): number {
    return this.agg.partialListenSeconds();
  }

  /** 종료 직전 지금까지 모은 분을 마감 */
  flush(): MinuteRecord | null {
    return this.agg.flush();
  }
}

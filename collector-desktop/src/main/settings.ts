import { app } from 'electron';
import { readFileSync, writeFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULT_CALIBRATION } from '@safeear/core';
import type { Settings } from '../shared/types';

export const DEFAULT_SETTINGS: Settings = {
  paused: false,
  loopbackIncludesVolume: false,
  defaultRefSplDb: DEFAULT_CALIBRATION.refSplDb,
  outputs: {},
  ageBand: null,
  mode: null,
  syncEnabled: true,
  syncAppNames: false,
  notify: { warn: true, rest: true, weekly: true },
  autoReduceVolume: false,
  launchAtLogin: true,
  theme: 'auto',
  accent: 'ocean',
  localOnlyChosen: false,
};

/** 원자적 쓰기 (쓰다가 꺼져도 파일이 깨지지 않게) */
export function writeJsonAtomic(path: string, value: unknown): void {
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(value, null, 2));
  renameSync(tmp, path);
}

export function readJson<T>(path: string, fallback: T): T {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as T;
  } catch {
    return fallback;
  }
}

export class SettingsStore {
  private readonly path = join(app.getPath('userData'), 'settings.json');
  value: Settings;

  constructor() {
    const saved = readJson<Partial<Settings>>(this.path, {});
    this.value = {
      ...DEFAULT_SETTINGS,
      ...saved,
      notify: { ...DEFAULT_SETTINGS.notify, ...(saved.notify ?? {}) },
      outputs: saved.outputs ?? {},
    };
  }

  update(patch: Partial<Settings>): Settings {
    this.value = { ...this.value, ...patch };
    this.save();
    return this.value;
  }

  save(): void {
    try {
      writeJsonAtomic(this.path, this.value);
    } catch (e) {
      console.error('[settings] save failed', e);
    }
  }
}

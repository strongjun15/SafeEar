/**
 * ⑨ 계정 동기화 (계획서 14절). 1분 요약 레코드만 올리고, 같은 계정의 다른 기기 기록을 받아온다.
 *  - 원시 오디오·1초 값은 올리지 않는다 (14.2절)
 *  - (device_id, minute_start)가 기본 키라 같은 레코드를 여러 번 보내도 중복되지 않는다 (14.3절 #6)
 *  - 앱 이름은 설정에서 허용한 경우에만 올린다
 */
import { EventEmitter } from 'node:events';
import { hostname } from 'node:os';
import type { MergeInput } from '@safeear/core';
import type { RemoteDevice, SyncView } from '../shared/types';
import type { AuthService } from './auth';
import type { SettingsStore } from './settings';
import type { DeviceIds, RecordStore, StoredRecord, SyncCursor } from './store';

export type RemoteRecord = MergeInput & { content_label: string | null; tier: string };

const UPLOAD_EVERY = 60_000;
const DOWNLOAD_EVERY = 5 * 60_000;
const BATCH = 500;

export class SyncService extends EventEmitter {
  remote: RemoteRecord[] = [];
  devices: RemoteDevice[] = [];
  view: SyncView = { enabled: true, lastUploadAt: null, lastDownloadAt: null, pending: 0, error: null };
  private busy = false;
  private timers: NodeJS.Timeout[] = [];

  constructor(
    private readonly auth: AuthService,
    private readonly store: RecordStore,
    private readonly settings: SettingsStore,
    private readonly ids: DeviceIds,
    private readonly cursor: SyncCursor,
    private readonly appVersion: string,
  ) {
    super();
  }

  start(): void {
    this.timers.push(setInterval(() => void this.upload(), UPLOAD_EVERY));
    this.timers.push(setInterval(() => void this.download(), DOWNLOAD_EVERY));
    this.auth.on('change', () => {
      this.remote = [];
      this.devices = [];
      void this.kick();
    });
    void this.kick();
  }

  stop(): void {
    this.timers.forEach(clearInterval);
  }

  private canSync(): string | null {
    return this.auth.client && this.auth.userId && this.settings.value.syncEnabled ? this.auth.userId : null;
  }

  async kick(): Promise<void> {
    this.view = { ...this.view, enabled: this.settings.value.syncEnabled };
    if (!this.canSync()) return;
    await this.registerDevice();
    await this.upload();
    await this.download();
  }

  private async registerDevice(): Promise<void> {
    const uid = this.canSync();
    if (!uid) return;
    const { error } = await this.auth.client!.from('devices').upsert({
      id: this.ids.for(uid),
      user_id: uid,
      name: hostname(),
      platform: 'windows',
      app_version: this.appVersion,
      last_seen_at: new Date().toISOString(),
    });
    if (error) this.fail('기기 등록', error.message);
  }

  private toRow(r: StoredRecord, uid: string) {
    const { owner_id: _owner, ...rest } = r;
    return { ...rest, user_id: uid, app_name: this.settings.value.syncAppNames ? r.app_name : null };
  }

  async upload(): Promise<void> {
    const uid = this.canSync();
    if (!uid || this.busy) return;
    this.busy = true;
    try {
      const pending = this.store.readSince(this.cursor.get(uid)).filter((r) => r.owner_id === uid);
      this.view = { ...this.view, pending: pending.length };
      for (let i = 0; i < pending.length; i += BATCH) {
        const batch = pending.slice(i, i + BATCH);
        const { error } = await this.auth.client!.from('minute_records').upsert(
          batch.map((r) => this.toRow(r, uid)),
          { onConflict: 'device_id,minute_start', ignoreDuplicates: true },
        );
        if (error) {
          this.fail('업로드', error.message);
          return;
        }
        this.cursor.set(uid, batch[batch.length - 1].minute_start);
        this.view = { ...this.view, pending: pending.length - i - batch.length };
      }
      this.view = { ...this.view, lastUploadAt: Date.now(), error: null };
    } catch (e) {
      this.fail('업로드', String(e));
    } finally {
      this.busy = false;
    }
  }

  async download(): Promise<void> {
    const uid = this.canSync();
    if (!uid) return;
    const client = this.auth.client!;
    try {
      const since = new Date(Date.now() - (7 * 24 + 1) * 3600_000).toISOString();
      const mine = this.ids.for(uid);
      const rows: RemoteRecord[] = [];
      for (let from = 0; ; from += 1000) {
        const { data, error } = await client
          .from('minute_records')
          .select('device_id,minute_start,output_type,tier,dose_eeh,dose_kurt,band_dose,listen_seconds,content_label')
          .gte('minute_start', since)
          .neq('device_id', mine)
          .order('minute_start', { ascending: true })
          .range(from, from + 999);
        if (error) {
          this.fail('다른 기기 기록 받기', error.message);
          return;
        }
        rows.push(...((data ?? []) as RemoteRecord[]));
        if (!data || data.length < 1000) break;
      }
      const { data: devs, error: devErr } = await client.from('devices').select('id,name,platform,last_seen_at').order('last_seen_at', { ascending: false });
      if (devErr) this.fail('기기 목록', devErr.message);
      this.remote = rows;
      this.devices = (devs ?? []) as RemoteDevice[];
      this.view = { ...this.view, lastDownloadAt: Date.now(), error: null };
      this.emit('remote');
    } catch (e) {
      this.fail('다른 기기 기록 받기', String(e));
    }
  }

  private fail(what: string, msg: string): void {
    console.warn(`[sync] ${what} 실패:`, msg);
    this.view = { ...this.view, error: `${what} 실패: ${msg}` };
  }
}

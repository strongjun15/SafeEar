/**
 * ⑥ 로컬 저장소 — 로컬 우선 (계획서 2.2절, 14.3절 #6 오프라인 우선).
 *
 * 1분 레코드를 하루 한 파일(JSON Lines)로 추가만 한다. 수정하지 않으므로 충돌이 없고,
 * (device_id, minute_start)가 같으면 서버에서 중복되지 않는다.
 * 원시 오디오와 1초 값은 저장하지 않는다.
 *
 * (계획서는 SQLite를 제안했지만, 하루 180개 남짓인 추가 전용 레코드라 네이티브 모듈 없는 파일로 충분하다.)
 */
import { app } from 'electron';
import { randomUUID } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { minuteOfIso, type MinuteRecord } from '@safeear/core';
import { readJson, writeJsonAtomic } from './settings';

/** 기기 안에서만 쓰는 필드를 더한 레코드 */
export interface StoredRecord extends MinuteRecord {
  /** 기록할 때 로그인해 있던 계정 (없으면 null — 업로드하지 않음) */
  owner_id: string | null;
}

const KEEP_IN_MEMORY_DAYS = 22;

export class RecordStore {
  private readonly dir = join(app.getPath('userData'), 'records');
  private memory: StoredRecord[] = [];

  constructor() {
    mkdirSync(this.dir, { recursive: true });
    const since = Date.now() - KEEP_IN_MEMORY_DAYS * 86400_000;
    this.memory = this.readSince(new Date(since).toISOString());
  }

  private fileFor(iso: string): string {
    return join(this.dir, `${iso.slice(0, 10)}.jsonl`);
  }

  append(r: StoredRecord): void {
    appendFileSync(this.fileFor(r.minute_start), JSON.stringify(r) + '\n');
    this.memory.push(r);
    const cutoff = Date.now() - KEEP_IN_MEMORY_DAYS * 86400_000;
    if (this.memory.length && Date.parse(this.memory[0].minute_start) < cutoff) {
      this.memory = this.memory.filter((x) => Date.parse(x.minute_start) >= cutoff);
    }
  }

  /** 메모리에 있는 최근 레코드 (최대 22일) */
  recent(sinceMinute: number): StoredRecord[] {
    return this.memory.filter((r) => minuteOfIso(r.minute_start) > sinceMinute);
  }

  /** 파일에서 iso 이후 레코드를 모두 읽는다 (오래 오프라인이었던 경우의 업로드용) */
  readSince(iso: string): StoredRecord[] {
    const day = iso.slice(0, 10);
    const out: StoredRecord[] = [];
    let files: string[] = [];
    try {
      files = readdirSync(this.dir).filter((f) => f.endsWith('.jsonl') && f.slice(0, 10) >= day).sort();
    } catch {
      return out;
    }
    for (const f of files) {
      for (const line of readFileSync(join(this.dir, f), 'utf8').split('\n')) {
        if (!line.trim()) continue;
        try {
          const r = JSON.parse(line) as StoredRecord;
          if (r.minute_start > iso) out.push(r);
        } catch {
          /* 깨진 줄은 건너뛴다 */
        }
      }
    }
    return out;
  }

  all(): StoredRecord[] {
    return this.readSince('0000');
  }

  clear(): void {
    rmSync(this.dir, { recursive: true, force: true });
    mkdirSync(this.dir, { recursive: true });
    this.memory = [];
  }
}

/**
 * 기기 ID — 설치 × 계정마다 하나. 한 PC를 여러 사람이 쓰면 계정마다 다른 기기 ID가 된다.
 * 로그인하지 않은 상태의 기록은 'local' 키의 ID를 쓴다.
 */
export class DeviceIds {
  private readonly path = join(app.getPath('userData'), 'device.json');
  private ids: Record<string, string>;

  constructor() {
    this.ids = readJson<Record<string, string>>(this.path, {});
  }

  for(ownerId: string | null): string {
    const key = ownerId ?? 'local';
    if (!this.ids[key]) {
      this.ids[key] = randomUUID();
      writeJsonAtomic(this.path, this.ids);
    }
    return this.ids[key];
  }
}

/** 업로드 커서 — 계정별로 마지막으로 올린 minute_start */
export class SyncCursor {
  private readonly path = join(app.getPath('userData'), 'sync-cursor.json');
  private cur: Record<string, string>;

  constructor() {
    this.cur = existsSync(this.path) ? readJson<Record<string, string>>(this.path, {}) : {};
  }

  get(owner: string): string {
    return this.cur[owner] ?? '0000';
  }

  set(owner: string, iso: string): void {
    this.cur[owner] = iso;
    writeJsonAtomic(this.path, this.cur);
  }

  reset(): void {
    this.cur = {};
    writeJsonAtomic(this.path, this.cur);
  }
}

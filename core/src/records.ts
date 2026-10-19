/**
 * 1분 요약 레코드와 다기기 병합. 계획서 14.2절, 14.3절.
 * 서버에는 이 레코드만 올라간다. 원시 오디오와 1초 값은 올리지 않는다.
 */
import { BAND_COUNT } from './bands.ts';
import { SCHEMA_VERSION } from './constants.ts';
import { dbFromPa2 } from './dose.ts';
import type { MinuteDose } from './gauges.ts';

/** 측정 등급 (13.1절): A 자체 재생 · B 시스템 캡처 · C 레벨 전용 · D 대리 추정 */
export type Tier = 'A' | 'B' | 'C' | 'D';

/** 출력 장치 종류 — 스피커는 선량 집계에서 제외 (13.3절) */
export type OutputType = 'headphones' | 'speaker' | 'unknown';

export type ContentLabel = 'music' | 'video' | 'game' | 'call' | 'browser' | 'other';

export interface MinuteRecord {
  device_id: string;
  /** 분 시작 시각 (UTC ISO 8601) */
  minute_start: string;
  output_id: string | null;
  output_type: OutputType;
  tier: Tier;
  /** 이 분에 실제로 소리가 난 초 수 */
  listen_seconds: number;
  /** 들은 구간의 등가 레벨 [dBA] */
  laeq_db: number | null;
  /** 등에너지 선량 [Pa²h] — 기존 방식 (이중 게이지 마커) */
  dose_eeh: number;
  /** 첨도 보정 선량 [Pa²h] — 등급 C면 null */
  dose_kurt: number | null;
  /** 대표 첨도 (선량 가중 평균) — 등급 C면 null */
  beta: number | null;
  /** 1/3 옥타브 19개 대역 A-가중 선량 [Pa²h] — 등급 C면 null */
  band_dose: number[] | null;
  /** 그 기기의 볼륨 값 0~100 (기기 간 비교 금지 — 14.4절) */
  volume_index: number | null;
  content_label: ContentLabel | null;
  /** 앱 이름 — 동기화 설정에서 허용한 경우에만 서버로 */
  app_name: string | null;
  calib_profile_id: string | null;
  calib_uncertainty_db: number | null;
  schema_version: number;
  app_version: string;
}

/** 1초 분석 결과 (기기 안에서만 존재) */
export interface SecondSample {
  /** 시각 [ms] */
  t: number;
  /** 소리가 났는가 (무음·음소거가 아님) */
  audible: boolean;
  outputType: OutputType;
  outputId: string | null;
  /** 추정 음압 제곱 [Pa²] (A-가중) */
  pa2: number;
  /** 첨도 보정 배율 w(β) */
  kurtWeight: number;
  beta: number | null;
  /** A-가중 에너지 중 각 대역이 차지하는 비율 (등급 C면 null) */
  bandFrac: number[] | null;
  volumeIndex: number | null;
  app: string | null;
  tier: Tier;
}

export const minuteOfMs = (ms: number): number => Math.floor(ms / 60000);
export const minuteOfIso = (iso: string): number => minuteOfMs(Date.parse(iso));
export const isoOfMinute = (minute: number): string => new Date(minute * 60000).toISOString();

const APP_LABELS: [RegExp, ContentLabel][] = [
  [/spotify|melon|genie|flo|bugs|vibe|itunes|music|foobar|aimp|winamp|musicbee|vlc/i, 'music'],
  [/netflix|potplayer|kmplayer|mpc-hc|mpv|wmplayer|movies|tving|wavve|coupang/i, 'video'],
  [/discord|zoom|teams|skype|kakaotalk|slack|webex/i, 'call'],
  [/chrome|msedge|firefox|whale|opera|brave|arc/i, 'browser'],
  [/steam|league|riot|valorant|overwatch|minecraft|javaw|battle\.net|genshin|maplestory|lostark|fifa|eafc|unity|unreal|game/i, 'game'],
];

/** 앱 이름으로 대략의 콘텐츠 범주를 붙인다 (파형 분류 모델 AI-3 이전의 단순 규칙) */
export function contentLabelForApp(app: string | null): ContentLabel | null {
  if (!app) return null;
  for (const [re, label] of APP_LABELS) if (re.test(app)) return label;
  return 'other';
}

interface Acc {
  seconds: number;
  pa2: number;
  pa2w: number;
  betaPa2: number;
  betaWeight: number;
  band: number[] | null;
  vol: number;
  volN: number;
  apps: Map<string, number>;
  outputs: Map<string, number>;
  types: Map<OutputType, number>;
  tier: Tier;
}

const newAcc = (): Acc => ({
  seconds: 0,
  pa2: 0,
  pa2w: 0,
  betaPa2: 0,
  betaWeight: 0,
  band: new Array(BAND_COUNT).fill(0),
  vol: 0,
  volN: 0,
  apps: new Map(),
  outputs: new Map(),
  types: new Map(),
  tier: 'B',
});

const mode = <K>(m: Map<K, number>): K | null => {
  let best: K | null = null;
  let n = -1;
  for (const [k, v] of m) if (v > n) { best = k; n = v; }
  return best;
};

export interface AggregatorContext {
  deviceId: () => string;
  calibration: () => { id: string; uncertaintyDb: number };
  appVersion: string;
}

/**
 * 1초 값을 모아 1분 레코드를 만든다. 이어폰(또는 미상) 출력 초와 스피커 출력 초는 따로 모은다.
 */
export class MinuteAggregator {
  private minute: number | null = null;
  private listen = newAcc();
  private speaker = newAcc();
  private readonly ctx: AggregatorContext;

  constructor(ctx: AggregatorContext) {
    this.ctx = ctx;
  }

  /** 분이 바뀌면 지난 분의 레코드를 돌려준다 */
  add(s: SecondSample): MinuteRecord | null {
    const m = minuteOfMs(s.t);
    let done: MinuteRecord | null = null;
    if (this.minute !== null && m !== this.minute) done = this.flush();
    this.minute = m;
    if (!s.audible || !(s.pa2 > 0)) return done;
    const acc = s.outputType === 'speaker' ? this.speaker : this.listen;
    acc.seconds += 1;
    acc.pa2 += s.pa2;
    acc.pa2w += s.pa2 * s.kurtWeight;
    if (s.beta != null) {
      acc.betaPa2 += s.beta * s.pa2;
      acc.betaWeight += s.pa2;
    }
    if (s.bandFrac && acc.band) for (let b = 0; b < BAND_COUNT; b++) acc.band[b] += s.pa2 * s.bandFrac[b];
    else acc.band = null;
    if (s.volumeIndex != null) {
      acc.vol += s.volumeIndex;
      acc.volN += 1;
    }
    if (s.app) acc.apps.set(s.app, (acc.apps.get(s.app) ?? 0) + 1);
    if (s.outputId) acc.outputs.set(s.outputId, (acc.outputs.get(s.outputId) ?? 0) + 1);
    acc.types.set(s.outputType, (acc.types.get(s.outputType) ?? 0) + 1);
    acc.tier = s.tier;
    return done;
  }

  /** 지금 모으고 있는 분의 선량 (실시간 게이지용) */
  partial(): MinuteDose | null {
    if (this.minute === null || !this.listen.seconds) return null;
    return { minute: this.minute, eeh: this.listen.pa2 / 3600, kurt: this.listen.pa2w / 3600 };
  }

  partialListenSeconds(): number {
    return this.listen.seconds;
  }

  flush(): MinuteRecord | null {
    if (this.minute === null) return null;
    const minute = this.minute;
    const acc = this.listen.seconds ? this.listen : this.speaker.seconds ? this.speaker : null;
    const outputType: OutputType | null = this.listen.seconds ? (mode(this.listen.types) ?? 'unknown') : this.speaker.seconds ? 'speaker' : null;
    this.listen = newAcc();
    this.speaker = newAcc();
    this.minute = null;
    if (!acc || !outputType) return null;
    const hasShape = acc.tier !== 'C';
    const app = mode(acc.apps);
    const cal = this.ctx.calibration();
    return {
      device_id: this.ctx.deviceId(),
      minute_start: isoOfMinute(minute),
      output_id: mode(acc.outputs),
      output_type: outputType,
      tier: acc.tier,
      listen_seconds: acc.seconds,
      laeq_db: round(dbFromPa2(acc.pa2 / acc.seconds), 2),
      dose_eeh: acc.pa2 / 3600,
      dose_kurt: hasShape ? acc.pa2w / 3600 : null,
      beta: hasShape && acc.betaWeight > 0 ? round(acc.betaPa2 / acc.betaWeight, 3) : null,
      band_dose: hasShape && acc.band ? acc.band.map((v) => v / 3600) : null,
      volume_index: acc.volN ? round(acc.vol / acc.volN, 1) : null,
      content_label: contentLabelForApp(app),
      app_name: app,
      calib_profile_id: cal.id,
      calib_uncertainty_db: cal.uncertaintyDb,
      schema_version: SCHEMA_VERSION,
      app_version: this.ctx.appVersion,
    };
  }
}

const round = (v: number, d: number): number => {
  const k = Math.pow(10, d);
  return Math.round(v * k) / k;
};

/** 병합에 필요한 최소 필드 */
export type MergeInput = Pick<
  MinuteRecord,
  'device_id' | 'minute_start' | 'output_type' | 'dose_eeh' | 'dose_kurt' | 'band_dose' | 'listen_seconds'
>;

export interface MergedMinute extends MinuteDose {
  listenSeconds: number;
  band: number[] | null;
  devices: string[];
  /** 같은 분에 두 기기 이상에서 이어폰 출력이 기록됨 (9절 #9) */
  overlap: boolean;
}

/**
 * 여러 기기의 레코드를 한 사람의 타임라인으로 합친다 (14.3절).
 *  - 합산은 에너지(Pa²h) 단위
 *  - 스피커 출력은 제외
 *  - 같은 분에 여러 기기가 겹치면 큰 값을 채택하고 겹침을 표시 (9절 #9 권장 방향)
 */
export function mergeRecords(records: Iterable<MergeInput>): Map<number, MergedMinute> {
  const out = new Map<number, MergedMinute>();
  for (const r of records) {
    if (r.output_type === 'speaker') continue;
    const minute = minuteOfIso(r.minute_start);
    const kurt = r.dose_kurt ?? r.dose_eeh;
    const cur = out.get(minute);
    if (!cur) {
      out.set(minute, {
        minute,
        eeh: r.dose_eeh,
        kurt,
        listenSeconds: r.listen_seconds,
        band: r.band_dose,
        devices: [r.device_id],
        overlap: false,
      });
      continue;
    }
    if (cur.devices.includes(r.device_id)) continue; // 같은 기기의 중복 레코드
    cur.devices.push(r.device_id);
    cur.overlap = true;
    if (kurt > cur.kurt) {
      cur.kurt = kurt;
      if (r.band_dose) cur.band = r.band_dose;
    }
    cur.eeh = Math.max(cur.eeh, r.dose_eeh);
    cur.listenSeconds = Math.max(cur.listenSeconds, r.listen_seconds);
  }
  return out;
}

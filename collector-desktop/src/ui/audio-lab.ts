/**
 * 「10년 뒤 이 노래」 (계획서 6.3절): ISO 1999 예측 NIPTS를 부호 반전해 EQ로 걸어 들려준다.
 * 500 Hz ~ 6 kHz 각 주파수에 peaking 필터, 그 위로 high-shelf.
 * ⚠ 청력검사가 아니라 예측값을 소리로 옮긴 시나리오다.
 */
import type { Scenario } from '../shared/types';

const BANDS: { f: number; q: number }[] = [
  { f: 500, q: 1.4 },
  { f: 1000, q: 1.4 },
  { f: 2000, q: 1.6 },
  { f: 3000, q: 2.1 },
  { f: 4000, q: 2.1 },
  { f: 6000, q: 1.8 },
];

export class AudioLab {
  private ctx: AudioContext | null = null;
  private filters: BiquadFilterNode[] = [];
  private shelf: BiquadFilterNode | null = null;
  private gain: GainNode | null = null;
  private src: AudioBufferSourceNode | null = null;
  private demo: AudioBuffer | null = null;
  private file: AudioBuffer | null = null;
  fileName: string | null = null;
  playing = false;
  private scenario: Scenario | null = null;
  onChange: (playing: boolean) => void = () => {};

  private build(): AudioContext {
    if (this.ctx) return this.ctx;
    const ctx = new AudioContext();
    this.ctx = ctx;
    this.filters = BANDS.map(({ f, q }) => {
      const b = ctx.createBiquadFilter();
      b.type = 'peaking';
      b.frequency.value = f;
      b.Q.value = q;
      return b;
    });
    this.shelf = ctx.createBiquadFilter();
    this.shelf.type = 'highshelf';
    this.shelf.frequency.value = 7000;
    this.gain = ctx.createGain();
    this.gain.gain.value = 0.5;
    const chain = [...this.filters, this.shelf, this.gain];
    for (let i = 0; i < chain.length - 1; i++) chain[i].connect(chain[i + 1]);
    this.gain.connect(ctx.destination);
    this.demo = this.makeDemo(ctx);
    return ctx;
  }

  /** 화음 + 하이햇 — 고음이 깎이는 걸 바로 들을 수 있는 짧은 반복 소리 */
  private makeDemo(ctx: AudioContext): AudioBuffer {
    const sr = ctx.sampleRate, dur = 2.4;
    const buf = ctx.createBuffer(1, Math.floor(sr * dur), sr);
    const d = buf.getChannelData(0);
    const notes = [196, 261.63, 329.63, 392];
    let seed = 1;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
    for (let i = 0; i < d.length; i++) {
      const t = i / sr;
      let v = 0;
      notes.forEach((f, ni) => {
        const env = Math.min(1, (t - ni * 0.12) * 6) * Math.exp(-Math.max(0, t - ni * 0.12) * 0.45);
        if (env <= 0) return;
        for (let n = 1; n <= 10; n++) v += (Math.sin(2 * Math.PI * f * n * t) / (n * 1.35)) * 0.03 * env;
      });
      const ht = t - Math.floor(t / 0.3) * 0.3;
      if (ht < 0.09) v += rnd() * Math.exp(-ht * 46) * 0.34;
      d[i] = Math.max(-1, Math.min(1, v));
    }
    return buf;
  }

  setScenario(s: Scenario | null): void {
    this.scenario = s;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const pts = s?.points ?? [];
    BANDS.forEach((b, i) => {
      const p = pts.find((x) => x.freq === b.f);
      this.filters[i].gain.setTargetAtTime(-(p?.db ?? 0), t, 0.05);
    });
    const top = pts.find((x) => x.freq === 6000);
    this.shelf!.gain.setTargetAtTime(-(top?.db ?? 0) * 0.8, t, 0.05);
  }

  async loadFile(f: File): Promise<void> {
    const ctx = this.build();
    this.file = await ctx.decodeAudioData(await f.arrayBuffer());
    this.fileName = f.name;
    if (this.playing) {
      this.stop();
      this.toggle();
    }
  }

  toggle(): boolean {
    const ctx = this.build();
    void ctx.resume();
    if (this.playing) {
      this.stop();
      return false;
    }
    const s = ctx.createBufferSource();
    s.buffer = this.file ?? this.demo;
    s.loop = true;
    s.connect(this.filters[0]);
    s.start();
    this.src = s;
    this.playing = true;
    this.setScenario(this.scenario);
    this.onChange(true);
    return true;
  }

  stop(): void {
    if (!this.playing) return;
    try {
      this.src?.stop();
    } catch {
      /* 이미 멈춤 */
    }
    this.playing = false;
    this.onChange(false);
  }
}

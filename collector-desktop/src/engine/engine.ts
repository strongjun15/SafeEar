/**
 * 엔진 창 (숨김) — ① 오디오 입력 어댑터 (윈도우: WASAPI loopback, 등급 B) + ② 1초 특징 추출.
 *
 * 받는 방법 (계획서 13.1절 Windows 행, 부록 A Electron loopback):
 *   1) getDisplayMedia + main의 setDisplayMediaRequestHandler({ audio: 'loopback' })
 *   2) 실패하면 getUserMedia({ chromeMediaSource: 'desktop' }) — 예전부터 윈도우에서 쓰던 방식
 * 두 방식 모두 영상 트랙이 함께 오지만 받자마자 멈춘다. 화면은 분석하지도 저장하지도 않는다.
 */
import { analyzeFrame } from '@safeear/core';
import type { EngineFrame, EngineStatus, WaveChunk } from '../shared/types';
import workletSource from './capture.worklet.js';

declare global {
  interface Window {
    engineBridge: {
      frame(f: EngineFrame): void;
      wave(w: WaveChunk): void;
      status(s: EngineStatus): void;
    };
    safeearEngine: { start(sourceId?: string): Promise<void>; startDemo(): Promise<void>; stop(): Promise<void> };
  }
}

const bridge = window.engineBridge;
const WAVE_POINTS = 24;

let ctx: AudioContext | null = null;
let stream: MediaStream | null = null;
let node: AudioWorkletNode | null = null;
let frame: Float32Array[] = [];
let filled = 0;
let generation = 0;
let keepVideo = false;
let startedAt = 0;

async function openLoopback(sourceId: string | undefined): Promise<{ stream: MediaStream; method: EngineStatus['method'] }> {
  try {
    const s = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 1 }, audio: true });
    if (s.getAudioTracks().length) return { stream: s, method: 'displayMedia' };
    s.getTracks().forEach((t) => t.stop());
    throw new Error('소리 트랙이 없어요');
  } catch (e) {
    if (!sourceId) throw e;
    const legacy = { mandatory: { chromeMediaSource: 'desktop' } } as unknown as MediaTrackConstraints;
    const legacyVideo = {
      mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: sourceId, maxWidth: 16, maxHeight: 16, maxFrameRate: 1 },
    } as unknown as MediaTrackConstraints;
    const s = await navigator.mediaDevices.getUserMedia({ audio: legacy, video: legacyVideo });
    return { stream: s, method: 'desktopUserMedia' };
  }
}

async function start(sourceId?: string): Promise<void> {
  await stop();
  const gen = ++generation;
  bridge.status({ status: 'starting' });
  try {
    const opened = await openLoopback(sourceId);
    if (gen !== generation) {
      opened.stream.getTracks().forEach((t) => t.stop());
      return;
    }
    stream = opened.stream;
    // 화면 영상은 쓰지 않는다. 일부 환경에서 영상 트랙을 멈추면 소리도 끊기는 경우를 대비해, 그때는 끄기만 한다.
    for (const v of stream.getVideoTracks()) {
      if (keepVideo) v.enabled = false;
      else v.stop();
    }
    const track = stream.getAudioTracks()[0];
    startedAt = Date.now();
    track.addEventListener('ended', () => {
      if (gen !== generation) return;
      if (!keepVideo && Date.now() - startedAt < 5000) keepVideo = true;
      bridge.status({ status: 'error', message: '소리 캡처가 끊겼어요. 다시 연결해요.' });
    });

    ctx = new AudioContext({ latencyHint: 'playback' });
    const url = URL.createObjectURL(new Blob([workletSource], { type: 'application/javascript' }));
    await ctx.audioWorklet.addModule(url);
    URL.revokeObjectURL(url);
    const src = ctx.createMediaStreamSource(new MediaStream([track]));
    node = new AudioWorkletNode(ctx, 'safeear-capture', {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [1],
      processorOptions: { chunk: Math.round(ctx.sampleRate / 10) },
    });
    const silent = ctx.createGain();
    silent.gain.value = 0;
    src.connect(node);
    node.connect(silent);
    silent.connect(ctx.destination);
    const sr = ctx.sampleRate;
    node.port.onmessage = (ev: MessageEvent<{ channels: Float32Array[] }>) => onChunk(ev.data.channels, sr);
    await ctx.resume();
    frame = [];
    filled = 0;
    bridge.status({
      status: 'running',
      sampleRate: sr,
      channels: track.getSettings().channelCount,
      method: opened.method,
    });
  } catch (e) {
    if (gen !== generation) return;
    bridge.status({ status: 'error', message: e instanceof Error ? `${e.name}: ${e.message}` : String(e) });
  }
}

/** 데모 소리: 화음 + 하이햇 + 가끔 큰 충격음 (첨도가 오르내리게). 스피커로 내보내지 않고 분석기에만 넣는다 */
async function startDemo(): Promise<void> {
  await stop();
  const gen = ++generation;
  ctx = new AudioContext({ latencyHint: 'playback' });
  const sr = ctx.sampleRate, dur = 8;
  const buf = ctx.createBuffer(2, sr * dur, sr);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < d.length; i++) {
      const t = i / sr;
      let v = 0;
      for (const f of [196, 261.63, 329.63, 392]) for (let n = 1; n <= 6; n++) v += (Math.sin(2 * Math.PI * f * n * t) / n) * 0.02;
      const ht = t % 0.25;
      if (ht < 0.05) v += rnd() * Math.exp(-ht * 60) * 0.25;
      const bang = t % 4;
      if (t > 4 && bang < 0.03) v += rnd() * Math.exp(-bang * 120) * 0.9;
      d[i] = Math.max(-1, Math.min(1, v));
    }
  }
  const url = URL.createObjectURL(new Blob([workletSource], { type: 'application/javascript' }));
  await ctx.audioWorklet.addModule(url);
  URL.revokeObjectURL(url);
  if (gen !== generation) return;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  node = new AudioWorkletNode(ctx, 'safeear-capture', {
    numberOfInputs: 1,
    numberOfOutputs: 1,
    outputChannelCount: [1],
    processorOptions: { chunk: Math.round(sr / 10) },
  });
  const silent = ctx.createGain();
  silent.gain.value = 0;
  src.connect(node);
  node.connect(silent);
  silent.connect(ctx.destination);
  node.port.onmessage = (ev: MessageEvent<{ channels: Float32Array[] }>) => onChunk(ev.data.channels, sr);
  src.start();
  await ctx.resume();
  frame = [];
  filled = 0;
  bridge.status({ status: 'running', sampleRate: sr, channels: 2, method: 'demo' });
}

async function stop(): Promise<void> {
  generation++;
  node?.port.close();
  node?.disconnect();
  node = null;
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
  if (ctx) await ctx.close().catch(() => undefined);
  ctx = null;
  frame = [];
  filled = 0;
}

function onChunk(chs: Float32Array[], sr: number): void {
  const n = chs[0]?.length ?? 0;
  if (!n) return;
  if (frame.length !== chs.length) {
    frame = chs.map(() => new Float32Array(sr));
    filled = 0;
  }
  let off = 0;
  while (off < n) {
    const take = Math.min(n - off, sr - filled);
    for (let c = 0; c < chs.length; c++) frame[c].set(chs[c].subarray(off, off + take), filled);
    filled += take;
    off += take;
    if (filled === sr) {
      // ② 1초 특징 추출 — 여기서 나온 숫자만 밖으로 나간다
      bridge.frame({ t: Date.now(), features: analyzeFrame(frame, sr) });
      filled = 0;
    }
  }
  sendWave(chs, n);
}

function sendWave(chs: Float32Array[], n: number): void {
  const min: number[] = [];
  const max: number[] = [];
  const seg = Math.max(1, Math.floor(n / WAVE_POINTS));
  let ss = 0;
  for (let p = 0; p < WAVE_POINTS; p++) {
    let lo = 0;
    let hi = 0;
    for (let i = p * seg; i < Math.min(n, (p + 1) * seg); i++) {
      let v = 0;
      for (const ch of chs) v += ch[i];
      v /= chs.length;
      if (v < lo) lo = v;
      if (v > hi) hi = v;
      ss += v * v;
    }
    min.push(Math.round(lo * 1000) / 1000);
    max.push(Math.round(hi * 1000) / 1000);
  }
  const ms = ss / (seg * WAVE_POINTS);
  bridge.wave({ min, max, rmsDbfs: ms > 0 ? 10 * Math.log10(ms) : -120 });
}

window.safeearEngine = { start, startDemo, stop };

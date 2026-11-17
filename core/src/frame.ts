/**
 * ② 1초 프레임 특징 추출. 계획서 3.1절, 16.4절.
 *
 * 입력: 한 프레임(보통 1초)의 PCM 채널들 (full scale = ±1.0)
 * 출력: 디지털 영역(dBFS)의 "모양" 값 — 크기(SPL)는 여기서 정하지 않는다 (13.3절: 크기와 모양을 따로 얻는다)
 *
 * 원시 오디오는 이 함수 밖으로 나가지 않는다. 반환값은 숫자 몇 개뿐이다.
 */
import { aWeightingPower } from './aweighting.ts';
import { BAND_COUNT, binToBandMap } from './bands.ts';
import { FFT } from './fft.ts';
import { accumulateMoments, betaFromMoments, emptyMoments, type Moments } from './kurtosis.ts';

export interface FrameFeatures {
  sampleRate: number;
  /** 채널당 표본 수 */
  samples: number;
  channels: number;
  /** 무가중 평균제곱 (DC 제거, 채널 평균) [FS²] */
  msZ: number;
  /** A-가중 평균제곱 [FS²] */
  msA: number;
  /** 1/3 옥타브 19개 대역의 A-가중 평균제곱 [FS²] */
  bandMsA: number[];
  /** 최대 절댓값 */
  peak: number;
  /** 첨도 계산용 적률 (모든 채널 표본을 한 모집단으로) */
  moments: Moments;
  /** 이 프레임만으로 구한 β */
  betaFrame: number | null;
}

interface SpectrumPlan {
  n: number;
  fft: FFT;
  window: Float64Array;
  aw: Float64Array;
  bandOf: Int8Array;
  re: Float64Array;
  im: Float64Array;
}

const plans = new Map<string, SpectrumPlan>();

function planFor(n: number, sampleRate: number): SpectrumPlan {
  const key = `${n}@${sampleRate}`;
  let p = plans.get(key);
  if (!p) {
    const window = new Float64Array(n);
    for (let i = 0; i < n; i++) window[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n);
    const aw = new Float64Array(n / 2 + 1);
    for (let k = 0; k <= n / 2; k++) aw[k] = aWeightingPower((k * sampleRate) / n);
    p = {
      n,
      fft: new FFT(n),
      window,
      aw,
      bandOf: binToBandMap(n, sampleRate),
      re: new Float64Array(n),
      im: new Float64Array(n),
    };
    plans.set(key, p);
  }
  return p;
}

function segmentSize(len: number, sampleRate: number): number {
  let n = sampleRate >= 32000 ? 8192 : 4096;
  while (n > len && n > 256) n >>= 1;
  return n;
}

/**
 * 한 프레임을 분석한다.
 * 에너지 총량(msZ)은 시간 영역에서 정확히 구하고, A-가중 비율과 대역 비율은 Welch 스펙트럼(Hann, 50% 겹침)에서 구한다.
 */
export function analyzeFrame(channels: ArrayLike<number>[], sampleRate: number): FrameFeatures {
  const chCount = channels.length;
  const len = chCount ? channels[0].length : 0;
  const empty: FrameFeatures = {
    sampleRate,
    samples: len,
    channels: chCount,
    msZ: 0,
    msA: 0,
    bandMsA: new Array(BAND_COUNT).fill(0),
    peak: 0,
    moments: emptyMoments(),
    betaFrame: null,
  };
  if (!chCount || len < 16) return empty;

  const moments = emptyMoments();
  let msSum = 0;
  let peak = 0;
  const means: number[] = [];
  for (const x of channels) {
    accumulateMoments(moments, x);
    let s = 0;
    for (let i = 0; i < len; i++) {
      s += x[i];
      const a = Math.abs(x[i]);
      if (a > peak) peak = a;
    }
    const mean = s / len;
    means.push(mean);
    let ss = 0;
    for (let i = 0; i < len; i++) {
      const d = x[i] - mean;
      ss += d * d;
    }
    msSum += ss / len;
  }
  const msZ = msSum / chCount;

  const n = segmentSize(len, sampleRate);
  const p = planFor(n, sampleRate);
  const hop = n >> 1;
  const starts: number[] = [];
  for (let s = 0; s + n <= len; s += hop) starts.push(s);
  if (!starts.length) starts.push(0);
  else if (starts[starts.length - 1] + n < len) starts.push(len - n);

  let total = 0;
  let weighted = 0;
  const band = new Array(BAND_COUNT).fill(0);
  for (let c = 0; c < chCount; c++) {
    const x = channels[c];
    const mean = means[c];
    for (const s of starts) {
      for (let i = 0; i < n; i++) {
        const v = s + i < len ? x[s + i] - mean : 0;
        p.re[i] = v * p.window[i];
        p.im[i] = 0;
      }
      p.fft.transform(p.re, p.im);
      for (let k = 1; k <= n / 2; k++) {
        const pk = p.re[k] * p.re[k] + p.im[k] * p.im[k];
        total += pk;
        const wk = pk * p.aw[k];
        weighted += wk;
        const b = p.bandOf[k];
        if (b >= 0) band[b] += wk;
      }
    }
  }

  const ratio = total > 0 ? msZ / total : 0;
  return {
    sampleRate,
    samples: len,
    channels: chCount,
    msZ,
    msA: weighted * ratio,
    bandMsA: band.map((v) => v * ratio),
    peak,
    moments,
    betaFrame: betaFromMoments(moments),
  };
}

/** 평균제곱 → dBFS (MS = 1 이 0 dB. 전체 진폭 사인파는 −3 dB) */
export function msToDbfs(ms: number): number {
  return ms > 0 ? 10 * Math.log10(ms) : -Infinity;
}

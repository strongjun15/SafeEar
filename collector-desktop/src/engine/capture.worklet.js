// AudioWorklet: 오디오 스레드에서 들어온 PCM을 0.1초 묶음으로 모아 엔진 창 메인 스레드로 넘긴다.
// 이 묶음은 엔진 창 안에서 분석된 뒤 바로 버려진다.
class SafeEarCapture extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.chunk = (options && options.processorOptions && options.processorOptions.chunk) || 4800;
    this.bufs = null;
    this.filled = 0;
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || input.length === 0) return true;
    if (!this.bufs || this.bufs.length !== input.length) {
      this.bufs = input.map(() => new Float32Array(this.chunk));
      this.filled = 0;
    }
    const n = input[0].length;
    let off = 0;
    while (off < n) {
      const take = Math.min(n - off, this.chunk - this.filled);
      for (let c = 0; c < input.length; c++) this.bufs[c].set(input[c].subarray(off, off + take), this.filled);
      this.filled += take;
      off += take;
      if (this.filled === this.chunk) {
        const out = this.bufs;
        this.port.postMessage({ channels: out }, out.map((b) => b.buffer));
        this.bufs = input.map(() => new Float32Array(this.chunk));
        this.filled = 0;
      }
    }
    return true;
  }
}

registerProcessor('safeear-capture', SafeEarCapture);

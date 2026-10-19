/** 엔진 창이 main으로 보낼 수 있는 것은 특징값 · 파형 포락선 · 상태뿐이다 */
import { contextBridge, ipcRenderer } from 'electron';
import type { EngineFrame, EngineStatus, WaveChunk } from '../shared/types';

contextBridge.exposeInMainWorld('engineBridge', {
  frame: (f: EngineFrame) => ipcRenderer.send('engine:frame', f),
  wave: (w: WaveChunk) => ipcRenderer.send('engine:wave', w),
  status: (s: EngineStatus) => ipcRenderer.send('engine:status', s),
});

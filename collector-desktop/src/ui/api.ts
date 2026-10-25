import type { AppState, SafeEarApi, WaveChunk } from '../shared/types';
import { demoApi } from '../preview/mock-api';

type UiApi = SafeEarApi & { setPaused(p: boolean): Promise<void> };

/** Demo state lives only in memory and never reaches native storage or account services. */
export function createUiApi(native: UiApi): UiApi {
  let demo = false;
  const states = new Set<(s: AppState) => void>();
  const waves = new Set<(w: WaveChunk) => void>();
  native.onState(s => { if (!demo) states.forEach(cb => cb(s)); });
  native.onWave(w => { if (!demo) waves.forEach(cb => cb(w)); });
  if (native !== demoApi) {
    demoApi.onState(s => { if (demo) states.forEach(cb => cb(s)); });
    demoApi.onWave(w => { if (demo) waves.forEach(cb => cb(w)); });
  }
  const active = () => demo ? demoApi : native;
  return new Proxy({} as UiApi, {
    get(_target, key: keyof UiApi) {
      if (key === 'onState') return (cb: (s: AppState) => void) => { states.add(cb); return () => states.delete(cb); };
      if (key === 'onWave') return (cb: (w: WaveChunk) => void) => { waves.add(cb); return () => waves.delete(cb); };
      if (key === 'signIn') return async (p: { email: string; password: string }) => {
        if (!['test11', 'test'].includes(p.email.trim())) return native.signIn(p);
        if (p.password !== p.email.trim()) return { ok: false, error: '아이디 또는 비밀번호가 맞지 않아요.' };
        demo = native !== demoApi;
        const result = await demoApi.signIn(p);
        if (!result.ok) demo = false;
        return result;
      };
      if (key === 'signOut') return async () => {
        const result = await active().signOut();
        if (result.ok) { demo = false; const s = await native.getState(); states.forEach(cb => cb(s)); }
        return result;
      };
      return (...args: unknown[]) => (active()[key] as (...args: unknown[]) => unknown)(...args);
    },
  });
}

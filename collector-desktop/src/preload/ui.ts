import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type { SafeEarApi } from '../shared/types';

const invoke = (channel: string, ...args: unknown[]) => ipcRenderer.invoke(channel, ...args);

function subscribe<T>(channel: string, cb: (v: T) => void): () => void {
  const h = (_e: IpcRendererEvent, v: T) => cb(v);
  ipcRenderer.on(channel, h);
  return () => ipcRenderer.off(channel, h);
}

const api: SafeEarApi & { setPaused(p: boolean): Promise<void> } = {
  getState: () => invoke('api:getState'),
  onState: (cb) => subscribe('state', cb),
  onWave: (cb) => subscribe('wave', cb),
  onNavigate: (cb) => subscribe('navigate', cb),
  signUp: (p) => invoke('api:signUp', p),
  signIn: (p) => invoke('api:signIn', p),
  signInWithGoogle: () => invoke('api:signInWithGoogle'),
  resetPassword: (email) => invoke('api:resetPassword', email),
  updatePassword: (pw) => invoke('api:updatePassword', pw),
  signOut: () => invoke('api:signOut'),
  continueLocal: () => invoke('api:continueLocal'),
  deleteAccount: () => invoke('api:deleteAccount'),
  updateProfile: (p) => invoke('api:updateProfile', p),
  setSettings: (p) => invoke('api:setSettings', p),
  setOutput: (id, p) => invoke('api:setOutput', id, p),
  listDevices: () => invoke('api:listDevices'),
  exportData: () => invoke('api:exportData'),
  clearLocalData: () => invoke('api:clearLocalData'),
  setDemoPlaying: (playing) => invoke('api:setDemoPlaying', playing),
  openExternal: (url) => invoke('api:openExternal', url),
  setPaused: (p) => invoke('api:setPaused', p),
};

contextBridge.exposeInMainWorld('safeear', api);

import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';

const apiBaseArg = process.argv.find((value) => value.startsWith('--slideforge-api-base='));
const apiBase = apiBaseArg ? apiBaseArg.slice('--slideforge-api-base='.length) : undefined;

contextBridge.exposeInMainWorld('slideforge', {
  apiBase,
  getApiBase: async (): Promise<string> => ipcRenderer.invoke('slideforge:get-api-base'),
  openDeckDialog: async (): Promise<{ path: string; filename: string } | null> =>
    ipcRenderer.invoke('slideforge:open-deck-dialog'),
  platform: process.platform,
  appVersion: process.versions.electron,
  onBackendPhase: (cb: (msg: string) => void) => {
    const handler = (_: IpcRendererEvent, msg: string) => cb(msg);
    ipcRenderer.on('slideforge:backend-phase', handler);
    return () => ipcRenderer.off('slideforge:backend-phase', handler);
  },
  onBackendReady: (cb: () => void) => {
    ipcRenderer.once('slideforge:backend-ready', () => cb());
  },
  onBackendError: (cb: (err: string) => void) => {
    ipcRenderer.once('slideforge:backend-error', (_: IpcRendererEvent, err: string) => cb(err));
  },
});

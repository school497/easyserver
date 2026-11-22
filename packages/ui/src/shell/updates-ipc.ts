import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import type { UpdateMode } from '@easyserver/core';
import { Updater } from './updater';

/** Creates the app's updater and exposes it to Settings › Updates. Returns true if an update is installing. */
export async function setupUpdates(kind: 'client' | 'server', getWindow: () => BrowserWindow | null, beforeInstall?: () => Promise<void>) {
  const updater = new Updater(kind, {
    onStatus: (s) => {
      const w = getWindow();
      if (w && !w.isDestroyed()) w.webContents.send('shell:updates:status', s);
    },
    beforeInstall,
    confirmRestart: async (version) => {
      const w = getWindow();
      const opts = {
        type: 'info' as const,
        message: `EasyServer ${version} is ready`,
        detail: 'Restart now to finish updating, or it installs the next time EasyServer opens.',
        buttons: ['Restart Now', 'Later'],
        defaultId: 0,
        cancelId: 1,
      };
      const r = w && !w.isDestroyed() ? await dialog.showMessageBox(w, opts) : await dialog.showMessageBox(opts);
      return r.response === 0;
    },
  });
  ipcMain.handle('shell:updates:get', () => ({ mode: updater.mode, status: updater.status, version: app.getVersion() }));
  ipcMain.handle('shell:updates:mode', (_e, mode: UpdateMode) => (updater.setMode(mode), updater.mode));
  ipcMain.handle('shell:updates:check', () => updater.check(true));
  return updater.start();
}

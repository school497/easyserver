import path from 'node:path';
import { app, BrowserWindow } from 'electron';
import { createMainWindow, singleInstance } from '@easyserver/ui/src/shell/window';
import { setupUpdates } from '@easyserver/ui/src/shell/updates-ipc';

app.setName('EasyServer');
let win: BrowserWindow | null = null;
const open = () => {
  if (win && !win.isDestroyed()) return win.show(), win.focus();
  win = createMainWindow({
    kind: 'client',
    title: 'EasyServer',
    preload: path.join(__dirname, 'preload.cjs'),
    rendererDir: path.join(__dirname, '..', 'dist'),
  });
};

if (singleInstance(open)) {
  app.whenReady().then(async () => {
    // A deferred update installs before the window appears.
    if (await setupUpdates('client', () => win)) return;
    open();
  });
  app.on('activate', open);
  app.on('window-all-closed', () => process.platform !== 'darwin' && app.quit());
}

import path from 'node:path';
import { app, BrowserWindow } from 'electron';
import { createMainWindow, singleInstance } from '@easyserver/ui/src/shell/window';

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
  app.whenReady().then(open);
  app.on('activate', open);
  app.on('window-all-closed', () => process.platform !== 'darwin' && app.quit());
}

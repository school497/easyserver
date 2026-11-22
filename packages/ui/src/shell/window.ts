/**
 * Electron main-process helpers shared by both desktop apps: the window, the native menu bar
 * (every command and shortcut is reachable from it), and safe link handling.
 * Imported only by apps/<name>/electron/main.ts.
 */
import path from 'node:path';
import { app, BrowserWindow, Menu, nativeTheme, shell, ipcMain, type MenuItemConstructorOptions } from 'electron';

export interface ShellOptions {
  kind: 'client' | 'server';
  title: string;
  preload: string;
  rendererDir: string;
  /** Server app only: exposes the agent IPC bridge to the page. */
  agentBridge?: boolean;
}

let servers: { id: string; name: string; selected: boolean }[] = [];

export function createMainWindow(o: ShellOptions): BrowserWindow {
  const mac = process.platform === 'darwin';
  const win = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 760,
    minHeight: 520,
    title: o.title,
    show: false,
    titleBarStyle: mac ? 'hiddenInset' : 'default',
    trafficLightPosition: mac ? { x: 18, y: 18 } : undefined,
    vibrancy: mac ? 'sidebar' : undefined,
    visualEffectState: mac ? 'followWindow' : undefined,
    backgroundColor: mac ? '#00000000' : nativeTheme.shouldUseDarkColors ? '#1E1E1F' : '#FFFFFF',
    autoHideMenuBar: false,
    webPreferences: {
      preload: o.preload,
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      spellcheck: false,
      additionalArguments: o.agentBridge ? ['--easyserver-agent'] : [],
    },
  });
  win.once('ready-to-show', () => win.show());

  // Links open in the default browser; the app itself never navigates away.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('http://localhost:') || !process.env.VITE_DEV_URL) e.preventDefault();
  });

  const dev = process.env.VITE_DEV_URL;
  if (dev) win.loadURL(dev);
  else win.loadFile(path.join(o.rendererDir, 'index.html'));

  ipcMain.on('shell:servers', (_e, list) => {
    servers = Array.isArray(list) ? list : [];
    buildMenu(o, win);
  });
  buildMenu(o, win);
  return win;
}

function buildMenu(o: ShellOptions, win: BrowserWindow) {
  const mac = process.platform === 'darwin';
  const send = (cmd: string) => () => {
    win.show();
    win.webContents.send('shell:menu', cmd);
  };
  const sections: MenuItemConstructorOptions[] = [
    { label: 'Home', accelerator: 'CmdOrCtrl+1', click: send('home') },
    { label: 'Discover', accelerator: 'CmdOrCtrl+2', click: send('discover') },
    { label: 'Plugins', accelerator: 'CmdOrCtrl+3', click: send('plugins') },
    { label: 'Search', accelerator: 'CmdOrCtrl+F', click: send('search') },
  ];
  const settings: MenuItemConstructorOptions = { label: mac ? 'Settings…' : 'Settings', accelerator: 'CmdOrCtrl+,', click: send('settings') };
  const template: MenuItemConstructorOptions[] = [];
  if (mac) {
    template.push({
      label: app.name,
      submenu: [{ role: 'about' }, { type: 'separator' }, settings, { type: 'separator' }, { role: 'services' }, { type: 'separator' }, { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' }, { type: 'separator' }, { role: 'quit' }],
    });
  }
  template.push({
    label: 'File',
    submenu: [
      ...(o.kind === 'client' ? [{ label: 'Add Server…', accelerator: 'CmdOrCtrl+N', click: send('addServer') } as MenuItemConstructorOptions, { type: 'separator' } as MenuItemConstructorOptions] : []),
      ...(mac ? [] : [settings, { type: 'separator' } as MenuItemConstructorOptions]),
      mac ? { role: 'close' } : { role: 'quit' },
    ],
  });
  template.push({ role: 'editMenu' });
  template.push({
    label: 'View',
    submenu: [
      ...sections,
      { type: 'separator' },
      { role: 'resetZoom', label: 'Actual Size' },
      { role: 'zoomIn', label: 'Larger Text' },
      { role: 'zoomOut', label: 'Smaller Text' },
      { type: 'separator' },
      { role: 'togglefullscreen' },
      ...(process.env.VITE_DEV_URL ? [{ type: 'separator' } as MenuItemConstructorOptions, { role: 'reload' } as MenuItemConstructorOptions, { role: 'toggleDevTools' } as MenuItemConstructorOptions] : []),
    ],
  });
  if (o.kind === 'client') {
    template.push({
      label: 'Server',
      submenu: [
        ...servers.map((s) => ({ label: s.name, type: 'radio', checked: s.selected, click: send(`select:${s.id}`) }) as MenuItemConstructorOptions),
        ...(servers.length ? [{ type: 'separator' } as MenuItemConstructorOptions] : []),
        { label: 'Add Server…', click: send('addServer') },
      ],
    });
  }
  template.push({ role: 'windowMenu' });

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

export function singleInstance(onSecond: () => void) {
  if (!app.requestSingleInstanceLock()) {
    app.quit();
    return false;
  }
  app.on('second-instance', onSecond);
  return true;
}

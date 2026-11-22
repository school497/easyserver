import os from 'node:os';
import path from 'node:path';
import { app, BrowserWindow, ipcMain, Menu, nativeImage, shell, Tray } from 'electron';
import { Agent } from '@easyserver/agent';
import { createMainWindow, singleInstance } from '@easyserver/ui/src/shell/window';

/**
 * EasyServer Server: the desktop app that turns this computer into a server.
 * The agent runs right here in the main process; the window is just a view onto it.
 * Closing the window keeps the server running (tray / menu bar icon to reopen or quit).
 */
app.setName('EasyServer Server');

type Setup = { phase: 'name'; suggested: string } | { phase: 'code'; code: string; expiresAt: string } | { phase: 'done' };

const agent = new Agent((level, msg) => console[level === 'error' ? 'error' : 'log'](`[agent] ${msg}`));
let win: BrowserWindow | null = null;
let tray: Tray | null = null;
let setup: Setup = { phase: 'name', suggested: os.hostname().replace(/\.local$/, '') };
let startError: string | null = null;
let quitting = false;
let ready: Promise<void> = Promise.resolve();

const send = (event: string, data?: unknown) => win && !win.isDestroyed() && win.webContents.send(`agent:${event}`, data);
const setSetup = (s: Setup) => {
  setup = s;
  send('setup', s);
};

let snapTimer: NodeJS.Timeout | null = null;
agent.on('change', () => {
  if (snapTimer) return;
  snapTimer = setTimeout(() => {
    snapTimer = null;
    send('snapshot', agent.snapshot());
    updateTray();
  }, 150);
});

async function runAgent() {
  try {
    startError = null;
    await agent.start();
    subscribeSources();
  } catch (e: any) {
    startError = e?.message ?? String(e);
    console.error(startError);
  }
}

/** Show codes until a client claims one; refresh the code before it expires. */
async function pairUntilClaimed(first?: { code: string; expiresAt: string }) {
  let current = first ?? (await agent.newPairingCode());
  setSetup({ phase: 'code', ...current });
  const refresh = setInterval(async () => {
    if (Date.parse(current.expiresAt) - Date.now() < 30_000) {
      current = await agent.newPairingCode();
      setSetup({ phase: 'code', ...current });
    }
  }, 10_000);
  try {
    await agent.waitForClaim();
  } finally {
    clearInterval(refresh);
  }
  setSetup({ phase: 'done' });
  await runAgent();
}

async function boot() {
  try {
    if (!agent.isSetUp()) return setSetup({ phase: 'name', suggested: setup.phase === 'name' ? setup.suggested : os.hostname() });
    await agent.connect();
    if (!(await agent.hasMembers())) return void pairUntilClaimed();
    setSetup({ phase: 'done' });
    await runAgent();
  } catch (e: any) {
    startError = e?.message ?? String(e);
    setSetup({ phase: 'done' });
  }
}

let sourcesSubscribed = false;
function subscribeSources() {
  if (sourcesSubscribed) return;
  sourcesSubscribed = true;
  agent.sb
    .channel('server-app-sources')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'plugin_sources' }, () => send('sourcesChanged'))
    .subscribe();
}

// ───────────── IPC (allow-listed in the preload) ─────────────
const handle = (name: string, fn: (...args: any[]) => any) =>
  ipcMain.handle(`agent:${name}`, async (_e, ...args) => {
    try {
      return await fn(...args);
    } catch (e: any) {
      return { error: e?.message ?? String(e) };
    }
  });

handle('setupState', async () => {
  await ready;
  return setup;
});
handle('setup', async (name: string) => {
  const code = await agent.setup(String(name));
  pairUntilClaimed(code).catch((e) => console.error(e));
});
handle('snapshot', async () => {
  await ready;
  if (startError) throw new Error(startError);
  return agent.snapshot();
});
handle('execute', (type: any, payload: any) => agent.execute(type, payload ?? {}));
handle('writeFiles', (pluginId: string, files: { path: string; data: Uint8Array }[], folder?: string) =>
  agent.plugins.writeLocalFiles(pluginId, files.map((f) => ({ path: String(f.path), data: new Uint8Array(f.data) })), folder),
);
handle('readFile', (pluginId: string, rel: string, folder?: string) => agent.plugins.readFile(pluginId, String(rel), folder));
handle('sources', async () => {
  await agent.connect();
  const { data, error } = await agent.sb.from('plugin_sources').select('github_url').order('id');
  if (error) throw new Error(error.message);
  return (data ?? []).map((r: any) => r.github_url);
});
handle('stats', async () => (await agent.sb.rpc('plugin_install_stats')).data ?? []);
handle('newPairingCode', () => agent.newPairingCode());
handle('members', () => agent.members());
handle('revoke', (userId: string) => agent.revokeMember(String(userId)));
handle('getOpenAtLogin', () => app.getLoginItemSettings().openAtLogin);
handle('setOpenAtLogin', (on: boolean) => app.setLoginItemSettings({ openAtLogin: !!on, openAsHidden: true, args: ['--hidden'] }));
handle('revealDataFolder', () => (shell.openPath(agent.home), agent.home));
handle('keyFingerprint', () => agent.keyFingerprint());
handle('reset', async () => {
  await agent.reset();
  setSetup({ phase: 'name', suggested: os.hostname() });
});

// ───────────── Window & tray ─────────────
function open() {
  if (win && !win.isDestroyed()) return win.show(), win.focus();
  win = createMainWindow({
    kind: 'server',
    title: 'EasyServer Server',
    preload: path.join(__dirname, 'preload.cjs'),
    rendererDir: path.join(__dirname, '..', 'dist'),
    agentBridge: true,
  });
  win.on('close', (e) => {
    // Keep serving when the window closes; quit from the tray or the app menu.
    if (!quitting) {
      e.preventDefault();
      win?.hide();
      if (process.platform === 'darwin') app.dock?.hide();
    }
  });
  win.on('show', () => process.platform === 'darwin' && app.dock?.show());
}

function updateTray() {
  if (!tray) return;
  const snap = agent.snapshot();
  const running = snap.plugins.filter((p) => p.status === 'running').length;
  tray.setToolTip(`EasyServer Server — ${snap.server?.name ?? 'not set up'}`);
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: snap.running ? `${snap.server?.name ?? 'Server'} is online` : 'Server is offline', enabled: false },
      { label: `${running} plugin${running === 1 ? '' : 's'} running`, enabled: false },
      { type: 'separator' },
      { label: 'Open EasyServer Server', click: open },
      { type: 'separator' },
      { label: 'Quit EasyServer Server', click: () => app.quit() },
    ]),
  );
}

function createTray() {
  const file = path.join(__dirname, '..', 'build', process.platform === 'darwin' ? 'trayTemplate.png' : 'tray.png');
  const img = nativeImage.createFromPath(file);
  if (img.isEmpty()) return;
  if (process.platform === 'darwin') img.setTemplateImage(true);
  tray = new Tray(img);
  tray.on('click', open);
  updateTray();
}

if (singleInstance(open)) {
  app.whenReady().then(async () => {
    createTray();
    ready = boot();
    if (!process.argv.includes('--hidden')) open();
    await ready;
    send('snapshot', agent.snapshot());
  });
  app.on('activate', open);
  app.on('window-all-closed', () => {
    /* keep running in the tray */
  });
  app.on('before-quit', async (e) => {
    if (quitting) return;
    quitting = true;
    e.preventDefault();
    await agent.stop().catch(() => {});
    app.exit(0);
  });
}

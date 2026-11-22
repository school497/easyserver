// Runs in the sandboxed preload. Exposes a tiny, allow-listed bridge; the page gets no Node access.
import { contextBridge, ipcRenderer } from 'electron';

const on = (channel: string, cb: (...a: any[]) => void) => {
  const fn = (_e: unknown, ...args: any[]) => cb(...args);
  ipcRenderer.on(channel, fn);
  return () => ipcRenderer.removeListener(channel, fn);
};

contextBridge.exposeInMainWorld('easyserverShell', {
  platform: process.platform,
  on: (event: 'menu', cb: (...a: any[]) => void) => (event === 'menu' ? on('shell:menu', cb) : () => {}),
  send: (event: 'servers', data: unknown) => event === 'servers' && ipcRenderer.send('shell:servers', data),
});

if (process.argv.includes('--easyserver-agent')) {
  const CHANNELS = new Set([
    'snapshot', 'execute', 'writeFiles', 'readFile', 'sources', 'stats', 'setupState', 'setup', 'newPairingCode',
    'members', 'revoke', 'getOpenAtLogin', 'setOpenAtLogin', 'revealDataFolder', 'reset', 'keyFingerprint',
  ]);
  const EVENTS = new Set(['snapshot', 'setup', 'sourcesChanged']);
  contextBridge.exposeInMainWorld('easyserver', {
    invoke: (channel: string, ...args: any[]) => (CHANNELS.has(channel) ? ipcRenderer.invoke(`agent:${channel}`, ...args) : Promise.reject(new Error('blocked'))),
    on: (event: string, cb: (...a: any[]) => void) => (EVENTS.has(event) ? on(`agent:${event}`, cb) : () => {}),
  });
}

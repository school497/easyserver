import type { CommandMap, CommandType } from '@easyserver/core';
import type { Backend, BackendState, LocalFile, SetupState } from './types';

interface Bridge {
  invoke(channel: string, ...args: any[]): Promise<any>;
  on(event: string, cb: (...args: any[]) => void): () => void;
}

const bridge = (): Bridge => {
  const b = (globalThis as any).easyserver as Bridge | undefined;
  if (!b) throw new Error('The server app must run inside its desktop shell.');
  return b;
};

async function call(channel: string, ...args: any[]) {
  const res = await bridge().invoke(channel, ...args);
  if (res && typeof res === 'object' && 'error' in res && Object.keys(res).length === 1) throw new Error(res.error);
  return res;
}

/**
 * Server app backend: the agent runs inside the Electron main process, so the UI talks to it
 * over IPC. Same commands, same data shapes as the client; no Supabase round trip.
 */
export class ServerBackend implements Backend {
  mode = 'server' as const;

  async init(push: (p: Partial<BackendState>) => void) {
    const apply = (snap: any) => {
      if (!snap) return;
      push({
        servers: snap.server ? [snap.server] : [],
        selectedId: snap.server?.id ?? null,
        status: snap.status,
        uptime: snap.uptime,
        plugins: [...snap.plugins].sort((a: any, b: any) => a.name.localeCompare(b.name)),
      });
    };
    bridge().on('snapshot', apply);
    apply(await call('snapshot'));
  }

  async select() {}

  send<T extends CommandType>(type: T, payload: CommandMap[T]) {
    return call('execute', type, payload);
  }

  async upload(pluginId: string, files: LocalFile[], onProgress?: (d: number, t: number) => void, folder?: string) {
    // Same machine: no encryption hop needed, the main process writes into the plugin's folder.
    for (let i = 0; i < files.length; i += 50) {
      await call('writeFiles', pluginId, files.slice(i, i + 50), folder);
      onProgress?.(Math.min(files.length, i + 50), files.length);
    }
  }

  async download(pluginId: string, path: string, folder?: string) {
    return new Uint8Array(await call('readFile', pluginId, path, folder));
  }

  sources = () => call('sources');
  onSourcesChanged(cb: () => void) {
    return bridge().on('sourcesChanged', cb);
  }
  installStats = () => call('stats');

  setupState = (): Promise<SetupState> => call('setupState');
  onSetupChanged(cb: (s: SetupState) => void) {
    return bridge().on('setup', cb);
  }
  setup = (name: string) => call('setup', name);
  newPairingCode = () => call('newPairingCode');
  members = () => call('members');
  revoke = (userId: string) => call('revoke', userId);
  getOpenAtLogin = () => call('getOpenAtLogin');
  setOpenAtLogin = (on: boolean) => call('setOpenAtLogin', on);
  revealDataFolder = () => call('revealDataFolder');
  resetServer = () => call('reset');
  keyFingerprint = () => call('keyFingerprint');
}

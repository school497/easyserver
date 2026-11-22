import type { PluginManifest } from './manifest';

export interface ServerRow {
  id: string;
  owner_id: string;
  name: string;
  hostname: string | null;
  platform: string | null;
  arch: string | null;
  agent_version: string | null;
  public_key: JsonWebKey | null;
  settings: Record<string, any>;
  started_at: string | null;
  last_seen_at: string | null;
  created_at: string;
}

export interface ServerStatusRow {
  server_id: string;
  cpu: number | null;
  mem_used: number | null;
  mem_total: number | null;
  disk_used: number | null;
  disk_total: number | null;
  load_avg: number | null;
  os_uptime: number | null;
  os_name: string | null;
  updated_at: string;
}

export type PluginStatus = 'installing' | 'stopped' | 'starting' | 'running' | 'stopping' | 'error';

export interface InstalledPluginRow {
  server_id: string;
  plugin_id: string;
  name: string;
  version: string;
  source_url: string | null;
  manifest: PluginManifest;
  settings: Record<string, any>;
  status: PluginStatus;
  status_detail: string | null;
  /** manifest.links rendered by the agent with real host/port values. */
  links: { label: string; url: string }[];
  installed_at: string;
  updated_at: string;
}

export interface CommandRow {
  id: string;
  server_id: string;
  created_by: string;
  type: CommandType;
  payload: any;
  status: 'pending' | 'running' | 'done' | 'error';
  result: any;
  error: string | null;
  created_at: string;
  updated_at: string;
}

/** Every command the agent understands, with its payload. */
export interface CommandMap {
  'server.ping': {};
  'server.rename': { name: string };
  'server.settings': { settings: Record<string, any> };
  'plugin.install': { sourceUrl: string };
  'plugin.uninstall': { pluginId: string; keepData?: boolean };
  'plugin.start': { pluginId: string };
  'plugin.stop': { pluginId: string };
  'plugin.restart': { pluginId: string };
  'plugin.settings': { pluginId: string; settings: Record<string, any> };
  'plugin.action': { pluginId: string; actionId: string };
  'plugin.logs': { pluginId: string; logId: string; lines?: number };
  'plugin.files.list': { pluginId: string; folder?: string };
  'plugin.files.upload': { pluginId: string; files: UploadedFileRef[]; folder?: string };
  'plugin.files.delete': { pluginId: string; path: string; folder?: string };
  /** The server seals the file to `publicKey` (a one-time key the client just made) and stages it. */
  'plugin.files.download': { pluginId: string; path: string; publicKey: JsonWebKey; folder?: string };
}
export type CommandType = keyof CommandMap;

export interface UploadedFileRef {
  path: string; // destination, relative to the plugin's content root
  object: string; // storage key in the `transfers` bucket
  size: number;
  epk: JsonWebKey;
  iv: string;
  salt: string;
  sha256: string;
}

export interface FileEntry {
  path: string;
  size: number;
  modified: string;
}

export interface UptimeRow {
  window_hours: number;
  ratio: number | null;
}

export const isOnline = (s: Pick<ServerRow, 'last_seen_at'> | null | undefined) =>
  !!s?.last_seen_at && Date.now() - new Date(s.last_seen_at).getTime() < 90_000;

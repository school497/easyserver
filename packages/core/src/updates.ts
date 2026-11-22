/**
 * Update feed shared by the desktop apps and the CLI. Each GitHub release carries `latest.json`:
 *   { version, released, apps: { client: { "win32-x64": Asset, … }, server: {…}, cli: {…} } }
 * Asset files are checked against their SHA-512 before anything is installed.
 */
export const UPDATE_FEED = 'https://github.com/school497/easyserver/releases/latest/download/latest.json';

export interface UpdateAsset {
  file: string;
  url: string;
  sha512: string; // hex
  size: number;
}

export interface UpdateManifest {
  version: string;
  released: string;
  apps: Record<'client' | 'server' | 'cli', Record<string, UpdateAsset>>;
}

export type UpdateMode = 'startup' | '1h' | '6h' | '24h' | 'off';
export const UPDATE_MODES: { value: UpdateMode; label: string; ms: number }[] = [
  { value: 'startup', label: 'When It Opens', ms: 0 },
  { value: '1h', label: 'Every Hour', ms: 3600_000 },
  { value: '6h', label: 'Every 6 Hours', ms: 6 * 3600_000 },
  { value: '24h', label: 'Every Day', ms: 24 * 3600_000 },
  { value: 'off', label: 'Never', ms: 0 },
];

export interface UpdateStatus {
  state: 'idle' | 'checking' | 'up-to-date' | 'downloading' | 'ready' | 'installing' | 'error' | 'unsupported';
  current: string;
  version?: string;
  progress?: number;
  error?: string;
  lastChecked?: string;
}

/** a > b for dotted numeric versions ("1.10.0" > "1.9.3"). */
export function newerVersion(a: string, b: string) {
  const pa = a.replace(/^v/, '').split(/[.-]/).map((x) => parseInt(x, 10) || 0);
  const pb = b.replace(/^v/, '').split(/[.-]/).map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) > (pb[i] ?? 0);
  }
  return false;
}

const feedOverride = () => {
  try {
    return typeof process !== 'undefined' ? process.env?.EASYSERVER_UPDATE_FEED : undefined;
  } catch {
    return undefined;
  }
};

export async function fetchManifest(feed = feedOverride() || UPDATE_FEED): Promise<UpdateManifest | null> {
  const res = await fetch(`${feed}?t=${Date.now()}`, { redirect: 'follow', headers: { Accept: 'application/json' } });
  if (res.status === 404) return null; // no release published yet
  if (!res.ok) throw new Error(`Update check failed (HTTP ${res.status})`);
  return (await res.json()) as UpdateManifest;
}

export const platformKey = (platform: string = process.platform, arch: string = process.arch) => `${platform}-${arch}`;

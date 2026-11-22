import fs from 'node:fs';
import os from 'node:os';
import { execFile } from 'node:child_process';

let prev = cpuTimes();
function cpuTimes() {
  let idle = 0;
  let total = 0;
  for (const c of os.cpus()) {
    const t = c.times;
    idle += t.idle;
    total += t.user + t.nice + t.sys + t.irq + t.idle;
  }
  return { idle, total };
}

export function cpuUsage(): number {
  const now = cpuTimes();
  const dIdle = now.idle - prev.idle;
  const dTotal = now.total - prev.total;
  prev = now;
  return dTotal > 0 ? Math.min(1, Math.max(0, 1 - dIdle / dTotal)) : 0;
}

let diskCache: { at: number; value: { used: number; total: number } | null } = { at: 0, value: null };

/** Disk usage for the drive holding `dir`. Uses statfs, falling back to df / PowerShell (Bun lacks statfs on Windows). */
export async function diskUsage(dir: string): Promise<{ used: number; total: number } | null> {
  try {
    const s = (fs as any).statfsSync(dir);
    const total = s.blocks * s.bsize;
    if (total > 0) return { used: total - s.bavail * s.bsize, total };
  } catch {}
  if (Date.now() - diskCache.at < 5 * 60_000) return diskCache.value;
  const run = (cmd: string, args: string[]) =>
    new Promise<string>((res) => execFile(cmd, args, { timeout: 8000, windowsHide: true }, (e, out) => res(e ? '' : String(out))));
  let value: { used: number; total: number } | null = null;
  if (process.platform === 'win32') {
    const drive = (dir.match(/^([A-Za-z]):/)?.[1] ?? 'C').toUpperCase();
    const out = await run('powershell.exe', ['-NoProfile', '-Command', `$d=Get-PSDrive ${drive}; "$($d.Used) $($d.Free)"`]);
    const [used, free] = out.trim().split(/\s+/).map(Number);
    if (used >= 0 && free >= 0 && used + free > 0) value = { used, total: used + free };
  } else {
    const out = await run('df', ['-kP', dir]);
    const cols = out.trim().split(/\r?\n/).pop()?.split(/\s+/) ?? [];
    const total = Number(cols[1]) * 1024;
    const used = Number(cols[2]) * 1024;
    if (total > 0) value = { used, total };
  }
  diskCache = { at: Date.now(), value };
  return value;
}

let osName: string | null = null;
export async function friendlyOsName(): Promise<string> {
  if (osName) return osName;
  const run = (cmd: string, args: string[]) =>
    new Promise<string>((res) => execFile(cmd, args, { timeout: 4000 }, (e, out) => res(e ? '' : String(out).trim())));
  if (process.platform === 'darwin') {
    const v = await run('sw_vers', ['-productVersion']);
    osName = v ? `macOS ${v}` : `macOS (Darwin ${os.release()})`;
  } else if (process.platform === 'linux') {
    try {
      const rel = fs.readFileSync('/etc/os-release', 'utf8');
      osName = rel.match(/^PRETTY_NAME="?([^"\n]+)"?/m)?.[1] ?? `Linux ${os.release()}`;
    } catch {
      osName = `Linux ${os.release()}`;
    }
  } else {
    const ver = (os as any).version?.() as string | undefined;
    osName = ver || `Windows ${os.release()}`;
  }
  return osName!;
}

export function lanAddress(): string {
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list ?? []) if (a.family === 'IPv4' && !a.internal) return a.address;
  }
  return '127.0.0.1';
}

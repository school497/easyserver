import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { APP_VERSION, fetchManifest, newerVersion, platformKey, UPDATE_MODES, type UpdateMode } from '@easyserver/core';
import { downloadVerified } from './download';
import { homeDir, readJson, writeJson } from './util';

/**
 * Self-update for the compiled `easyserver` CLI. Replaces its own executable with the release
 * build for this platform (after a SHA-512 check), then restarts:
 *   under systemd / launchd  exits and lets the service manager start the new binary
 *   otherwise                starts the new binary in its place with the same arguments
 */
const settingsFile = () => path.join(homeDir(), 'cli-updates.json');
export const cliUpdateMode = (): UpdateMode => readJson<{ mode?: UpdateMode }>(settingsFile(), {}).mode ?? 'startup';
export const setCliUpdateMode = (mode: UpdateMode) => writeJson(settingsFile(), { mode });

export function isCompiledCli() {
  return !!(process.versions as any).bun && !/^bun(\.exe)?$/i.test(path.basename(process.execPath));
}

/** Remove the previous executable left behind by a Windows update. */
export function cleanupOldBinary() {
  try {
    fs.rmSync(process.execPath + '.old', { force: true });
  } catch {}
}

/** Returns the new version if one was installed (the caller should then stop and call restartIntoUpdate). */
export async function downloadCliUpdate(log: (m: string) => void): Promise<string | null> {
  if (!isCompiledCli()) {
    log('Updates apply to the installed easyserver binary, not a development build.');
    return null;
  }
  const m = await fetchManifest();
  if (!m || !newerVersion(m.version, APP_VERSION)) return null;
  const asset = m.apps.cli?.[platformKey()];
  if (!asset) throw new Error(`Version ${m.version} has no CLI build for ${platformKey()}.`);
  log(`Downloading EasyServer ${m.version}…`);
  const exe = process.execPath;
  await downloadVerified(asset, exe + '.new');
  if (process.platform === 'win32') {
    // A running .exe can be renamed but not overwritten.
    fs.rmSync(exe + '.old', { force: true });
    fs.renameSync(exe, exe + '.old');
    fs.renameSync(exe + '.new', exe);
  } else {
    fs.chmodSync(exe + '.new', 0o755);
    fs.renameSync(exe + '.new', exe);
  }
  return m.version;
}

export function restartIntoUpdate() {
  const managed = !!(process.env.INVOCATION_ID || process.env.XPC_SERVICE_NAME);
  if (managed) process.exit(0);
  const child = spawn(process.execPath, process.argv.slice(2), { stdio: 'inherit' });
  child.on('exit', (code) => process.exit(code ?? 0));
}

export function updateIntervalMs(mode: UpdateMode) {
  return UPDATE_MODES.find((m) => m.value === mode)?.ms ?? 0;
}

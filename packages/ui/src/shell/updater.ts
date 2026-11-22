/**
 * Desktop auto-updater for both Electron apps.
 *
 * Checks the release feed when the app opens and/or on an interval (Settings › Updates),
 * downloads the build for this platform, verifies its SHA-512 and installs it:
 *   Windows  silent NSIS install, then the installer relaunches the app
 *   macOS    swaps the .app bundle in place from the release zip, then reopens it
 *   Linux    replaces the running AppImage, then relaunches it
 * The server app installs as soon as an update is ready (after saving which plugins were
 * running, so they start again). The client app installs right away on launch; mid-session
 * it asks first and otherwise installs the next time it opens.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { app } from 'electron';
import { fetchManifest, newerVersion, platformKey, UPDATE_MODES, type UpdateAsset, type UpdateMode, type UpdateStatus } from '@easyserver/core';
import { downloadVerified } from '@easyserver/agent/src/download';

interface Saved {
  mode: UpdateMode;
  pending?: { version: string; file: string };
}

export class Updater {
  private file = path.join(app.getPath('userData'), 'updates.json');
  private dir = path.join(app.getPath('userData'), 'updates');
  private saved: Saved;
  private timer: NodeJS.Timeout | null = null;
  private busy = false;
  status: UpdateStatus = { state: 'idle', current: app.getVersion() };

  constructor(
    private kind: 'client' | 'server',
    private hooks: {
      onStatus: (s: UpdateStatus) => void;
      /** Server: save running plugins and stop the agent. */
      beforeInstall?: () => Promise<void>;
      /** Client: ask before restarting mid-session; resolve true to install now. */
      confirmRestart?: (version: string) => Promise<boolean>;
    },
  ) {
    let s: Saved = { mode: 'startup' };
    try {
      s = { ...s, ...JSON.parse(fs.readFileSync(this.file, 'utf8')) };
    } catch {}
    this.saved = s;
  }

  get mode() {
    return this.saved.mode;
  }

  private save() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file, JSON.stringify(this.saved, null, 2));
  }

  private set(patch: Partial<UpdateStatus>) {
    this.status = { ...this.status, ...patch };
    this.hooks.onStatus(this.status);
  }

  /** Call once at launch. Returns true if an update is being installed (the app will exit). */
  async start(): Promise<boolean> {
    if (!app.isPackaged) {
      this.set({ state: 'unsupported', error: 'Updates install in the packaged app only.' });
      return false;
    }
    // An update downloaded earlier (client deferred it): install before showing anything.
    const p = this.saved.pending;
    if (p && newerVersion(p.version, app.getVersion()) && fs.existsSync(p.file)) {
      await this.install(p.file, p.version);
      return true;
    }
    if (p) {
      delete this.saved.pending;
      this.save();
    }
    this.schedule();
    if (this.saved.mode !== 'off') setTimeout(() => this.check(false, true), 4000);
    return false;
  }

  setMode(mode: UpdateMode) {
    this.saved.mode = mode;
    this.save();
    this.schedule();
  }

  private schedule() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    const ms = UPDATE_MODES.find((m) => m.value === this.saved.mode)?.ms ?? 0;
    if (ms) this.timer = setInterval(() => this.check(false, false), ms);
  }

  async check(manual = false, atLaunch = false) {
    if (this.busy) return this.status;
    if (!app.isPackaged) return this.status;
    this.busy = true;
    try {
      this.set({ state: 'checking', error: undefined });
      const m = await fetchManifest();
      const asset = m?.apps[this.kind]?.[platformKey()];
      this.set({ lastChecked: new Date().toISOString() });
      if (!m || !newerVersion(m.version, app.getVersion())) return this.set({ state: 'up-to-date', version: m?.version }), this.status;
      if (!asset) return this.set({ state: 'error', version: m.version, error: `Version ${m.version} has no build for this computer.` }), this.status;
      if (process.platform === 'linux' && !process.env.APPIMAGE) {
        return this.set({ state: 'error', version: m.version, error: `Version ${m.version} is out. Install it with your package manager, or use the AppImage for automatic updates.` }), this.status;
      }
      this.set({ state: 'downloading', version: m.version, progress: 0 });
      let last = 0;
      const file = await downloadVerified(asset, path.join(this.dir, asset.file), (f) => {
        if (f - last > 0.02 || f >= 1) (last = f), this.set({ progress: f });
      });
      this.set({ state: 'ready', progress: 1 });
      // Server: install now. Client: install now if just launched or the user agrees; otherwise on next launch.
      if (this.kind === 'server' || atLaunch || manual || (await this.hooks.confirmRestart?.(m.version))) {
        await this.install(file, m.version);
      } else {
        this.saved.pending = { version: m.version, file };
        this.save();
      }
    } catch (e: any) {
      this.set({ state: 'error', error: e?.message ?? String(e) });
    } finally {
      this.busy = false;
    }
    return this.status;
  }

  /** Install a downloaded update now (also used by "Restart to Update"). */
  async installPending() {
    const p = this.saved.pending;
    if (p && fs.existsSync(p.file)) await this.install(p.file, p.version);
  }

  private async install(file: string, version: string) {
    this.set({ state: 'installing', version });
    delete this.saved.pending;
    this.save();
    await this.hooks.beforeInstall?.().catch(() => {});
    if (process.platform === 'win32') {
      // Silent install into the existing location; --force-run reopens the app afterwards.
      spawn(file, ['/S', '--updated', '--force-run'], { detached: true, stdio: 'ignore' }).unref();
    } else if (process.platform === 'darwin') {
      const bundle = path.resolve(app.getPath('exe'), '..', '..', '..');
      const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'easyserver-update-'));
      execFileSync('ditto', ['-x', '-k', file, stage]);
      const fresh = fs.readdirSync(stage).find((f) => f.endsWith('.app'));
      if (!fresh) throw new Error('The update archive has no app inside.');
      const script = path.join(stage, 'swap.sh');
      fs.writeFileSync(
        script,
        `#!/bin/sh
while kill -0 ${process.pid} 2>/dev/null; do sleep 0.3; done
rm -rf "${bundle}.old" && mv "${bundle}" "${bundle}.old" && mv "${path.join(stage, fresh)}" "${bundle}" && rm -rf "${bundle}.old"
xattr -cr "${bundle}" 2>/dev/null
open "${bundle}"
`,
        { mode: 0o755 },
      );
      spawn('/bin/sh', [script], { detached: true, stdio: 'ignore' }).unref();
    } else {
      const target = process.env.APPIMAGE!;
      fs.copyFileSync(file, target + '.new');
      fs.chmodSync(target + '.new', 0o755);
      fs.renameSync(target + '.new', target);
      spawn(target, [], { detached: true, stdio: 'ignore' }).unref();
    }
    setTimeout(() => app.exit(0), 300);
  }
}

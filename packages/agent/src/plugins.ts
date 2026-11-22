import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawn, execFile, type ChildProcess } from 'node:child_process';
import {
  type PluginManifest,
  type PluginStatus,
  type Platform,
  type UploadedFileRef,
  type FileEntry,
  validateManifest,
  sanitizeSettings,
  defaultSettings,
  parseGithubUrl,
  rawUrl,
  manifestUrl,
  open as openSealed,
  seal,
  pluginFolders,
  settingFolderId,
  type FolderSpec,
} from '@easyserver/core';
import { ensureDir, readJson, writeJson, safeJoin, tailFile, render, errMsg, type Logger } from './util';
import { lanAddress } from './metrics';
import { buildCommand, resolveCandidate, scriptEnv, type CommandSpec } from './runtime';

export interface InstalledRecord {
  manifest: PluginManifest;
  settings: Record<string, any>;
  sourceUrl: string;
  desired: 'running' | 'stopped';
  installedAt: string;
}

export interface PluginState {
  id: string;
  record: InstalledRecord;
  status: PluginStatus;
  detail: string | null;
}

export interface PluginHost {
  home: string;
  log: Logger;
  /** Called after any plugin state change; the agent mirrors it to Supabase. */
  onChange(id: string, removed?: boolean): void;
  /** Checks that a source URL is listed (and enabled) in the plugin_sources table. */
  isApprovedSource(url: string): Promise<boolean>;
  /** Downloads a ciphertext object from the transfers bucket and deletes it afterwards. */
  takeTransfer(objectKey: string): Promise<Uint8Array>;
  /** Uploads ciphertext for a client to download; returns the object key. */
  putTransfer(bytes: Uint8Array): Promise<string>;
  serverId(): string;
  privateKey(): JsonWebKey;
}

const MAX_FILE = 25 * 1024 * 1024;
const MAX_TOTAL = 100 * 1024 * 1024;

export class PluginManager {
  private records: Record<string, InstalledRecord>;
  private status = new Map<string, { status: PluginStatus; detail: string | null }>();
  private procs = new Map<string, ChildProcess>();
  private stopping = new Set<string>();
  private resolved = new Map<string, { bin: Record<string, string>; req: Record<string, Record<string, string>> }>();
  private healthTimers = new Map<string, NodeJS.Timeout>();

  constructor(private host: PluginHost) {
    this.records = readJson(this.indexFile, {});
    for (const id of Object.keys(this.records)) this.status.set(id, { status: 'stopped', detail: null });
  }

  private get indexFile() {
    return path.join(this.host.home, 'plugins.json');
  }
  private save() {
    writeJson(this.indexFile, this.records);
  }
  dirs(id: string) {
    const root = path.join(this.host.home, 'plugins', id);
    return {
      root,
      pkg: path.join(root, 'package'),
      runtime: path.join(root, 'runtime'),
      data: path.join(root, 'data'),
      logs: path.join(root, 'logs'),
    };
  }

  list(): PluginState[] {
    return Object.entries(this.records).map(([id, record]) => ({ id, record, ...this.status.get(id)! }));
  }
  get(id: string): PluginState {
    const record = this.records[id];
    if (!record) throw new Error(`Plugin ${id} is not installed`);
    return { id, record, ...this.status.get(id)! };
  }

  private setStatus(id: string, status: PluginStatus, detail: string | null = null) {
    this.status.set(id, { status, detail });
    this.host.onChange(id);
  }

  // ───────────── Install / uninstall ─────────────

  async install(sourceUrl: string): Promise<PluginState> {
    if (!(await this.host.isApprovedSource(sourceUrl))) throw new Error('This plugin is not listed in the plugin store.');
    const loc = parseGithubUrl(sourceUrl);
    const res = await fetch(manifestUrl(loc), { cache: 'no-store' });
    if (!res.ok) throw new Error(`Couldn't download the plugin manifest (HTTP ${res.status}).`);
    const text = await res.text();
    if (text.length > 256 * 1024) throw new Error('Manifest is too large.');
    const v = validateManifest(JSON.parse(text));
    if (!v.ok) throw new Error(`Invalid manifest: ${v.errors.join('; ')}`);
    const m = v.manifest;
    if (!m.platforms.includes(process.platform as Platform)) throw new Error(`${m.name} doesn't support ${process.platform}.`);

    const existing = this.records[m.id];
    const d = this.dirs(m.id);
    this.status.set(m.id, { status: 'installing', detail: 'Downloading files' });
    if (!existing) {
      this.records[m.id] = { manifest: m, settings: defaultSettings(m), sourceUrl, desired: 'stopped', installedAt: new Date().toISOString() };
    }
    this.host.onChange(m.id);

    try {
      if (existing) await this.stop(m.id);
      const staging = d.pkg + '.new';
      fs.rmSync(staging, { recursive: true, force: true });
      ensureDir(staging);
      let total = 0;
      for (const file of m.files) {
        const r = await fetch(rawUrl(loc, file), { cache: 'no-store' });
        if (!r.ok) throw new Error(`Couldn't download ${file} (HTTP ${r.status}).`);
        const buf = Buffer.from(await r.arrayBuffer());
        total += buf.length;
        if (buf.length > MAX_FILE || total > MAX_TOTAL) throw new Error('Plugin files are too large.');
        const dest = safeJoin(staging, file);
        ensureDir(path.dirname(dest));
        fs.writeFileSync(dest, buf);
      }
      fs.writeFileSync(path.join(staging, 'easyserver.plugin.json'), text);
      fs.rmSync(d.pkg, { recursive: true, force: true });
      fs.renameSync(staging, d.pkg);
      [d.runtime, d.data, d.logs].forEach((p) => ensureDir(p));

      this.records[m.id] = {
        manifest: m,
        settings: existing ? sanitizeSettings(m, existing.settings) : defaultSettings(m),
        sourceUrl,
        desired: existing?.desired ?? 'stopped',
        installedAt: existing?.installedAt ?? new Date().toISOString(),
      };
      this.save();

      this.setStatus(m.id, 'installing', 'Checking requirements');
      await this.resolveRequirements(m.id, true);

      for (const s of m.seed ?? []) {
        const dest = safeJoin(d.data, s.dest);
        if (!fs.existsSync(dest)) {
          ensureDir(path.dirname(dest));
          fs.cpSync(safeJoin(d.pkg, s.src), dest, { recursive: true });
        }
      }
      this.setStatus(m.id, 'stopped');
      this.host.log('info', `Installed ${m.name} ${m.version}`);
      if (this.records[m.id].desired === 'running') await this.start(m.id);
      return this.get(m.id);
    } catch (e) {
      if (!existing) {
        delete this.records[m.id];
        this.save();
        this.status.delete(m.id);
        fs.rmSync(d.root, { recursive: true, force: true });
        this.host.onChange(m.id, true);
      } else {
        this.setStatus(m.id, 'error', errMsg(e));
      }
      throw e;
    }
  }

  async uninstall(id: string, keepData = false) {
    this.get(id);
    await this.stop(id);
    const d = this.dirs(id);
    if (keepData) {
      for (const p of [d.pkg, d.runtime, d.logs]) fs.rmSync(p, { recursive: true, force: true });
    } else {
      fs.rmSync(d.root, { recursive: true, force: true });
    }
    delete this.records[id];
    this.status.delete(id);
    this.resolved.delete(id);
    this.save();
    this.host.onChange(id, true);
  }

  // ───────────── Requirements & templates ─────────────

  /** Context without resolved binaries: used to find and install requirements. */
  private baseContext(id: string) {
    const rec = this.records[id];
    const d = this.dirs(id);
    const fwd = (p: string) => p.replace(/\\/g, '/');
    return {
      pluginDir: fwd(d.pkg),
      runtimeDir: fwd(d.runtime),
      dataDir: fwd(d.data),
      logsDir: fwd(d.logs),
      platform: process.platform,
      arch: process.arch,
      isWin: process.platform === 'win32',
      isMac: process.platform === 'darwin',
      isLinux: process.platform === 'linux',
      isArm: process.arch === 'arm64',
      isX64: process.arch === 'x64',
      host: lanAddress(),
      hostname: os.hostname(),
      home: os.homedir().replace(/\\/g, '/'),
      settings: rec.settings,
      files: this.settingFiles(id),
      env: process.env,
    };
  }

  private async resolveRequirements(id: string, allowInstall: boolean) {
    const { manifest: m } = this.records[id];
    const plat = process.platform as Platform;
    const out = { bin: {} as Record<string, string>, req: {} as Record<string, Record<string, string>> };
    for (const r of m.requires ?? []) {
      const ctx = { ...this.baseContext(id), bin: out.bin, req: out.req };
      const find = () => {
        for (const c of r.candidates[plat] ?? []) {
          const p = resolveCandidate(c.path, ctx);
          if (p) {
            const vars: Record<string, string> = {};
            for (const [k, v] of Object.entries(c.vars ?? {})) vars[k] = render(v, { ...ctx, match: p, matchDir: path.posix.dirname(p) });
            return { path: p, vars };
          }
        }
        return null;
      };
      let hit = find();
      if (!hit && allowInstall && r.install?.[plat]?.length) {
        this.setStatus(id, 'installing', `Installing ${r.label}`);
        const logFile = path.join(this.dirs(id).logs, 'install.log');
        for (const step of r.install[plat]!) {
          const code = await runInstallStep(step, ctx, logFile);
          this.host.log('info', `[${id}] install step exited ${code}`);
          if (code !== 0) break;
        }
        hit = find();
      }
      if (!hit) throw new Error(`${r.label} was not found. ${r.hint ?? ''}`.trim());
      out.bin[r.id] = hit.path;
      out.req[r.id] = hit.vars;
    }
    this.resolved.set(id, out);
    return out;
  }

  /** Re-runs requirement installs (for an "Update" action or after changing a version setting). */
  async reinstallRequirements(id: string) {
    this.resolved.delete(id);
    return this.resolveRequirements(id, true);
  }

  async context(id: string) {
    const res = this.resolved.get(id) ?? (await this.resolveRequirements(id, false));
    return { ...this.baseContext(id), bin: res.bin, req: res.req };
  }

  private async renderTemplates(id: string) {
    const { manifest: m } = this.records[id];
    const d = this.dirs(id);
    const ctx = await this.context(id);
    for (const t of m.templates ?? []) {
      const src = fs.readFileSync(safeJoin(d.pkg, t.src), 'utf8');
      const dest = safeJoin(t.into === 'data' ? d.data : d.runtime, t.dest);
      ensureDir(path.dirname(dest));
      fs.writeFileSync(dest, render(src, ctx));
    }
    return ctx;
  }

  // ───────────── Process lifecycle ─────────────

  async start(id: string, persist = true) {
    const rec = this.get(id).record;
    if (this.procs.has(id)) return;
    if (persist) {
      rec.desired = 'running';
      this.save();
    }
    this.setStatus(id, 'starting');
    try {
      const ctx = await this.renderTemplates(id);
      const d = this.dirs(id);
      ensureDir(d.logs);
      const spec = this.runSpec(id);
      const { command, args, env } = buildCommand(spec, ctx, scriptEnv(ctx));
      const cwd = spec.cwd ? this.insidePlugin(id, render(spec.cwd, ctx)) : d.runtime;
      ensureDir(cwd);
      const out = fs.openSync(path.join(d.logs, 'process.log'), 'a');
      const child = spawn(command, args, {
        cwd,
        env,
        stdio: ['ignore', out, out],
        windowsHide: true,
      });
      fs.closeSync(out);
      this.procs.set(id, child);
      this.host.log('info', `[${id}] started (pid ${child.pid})`);

      child.on('error', (e) => {
        this.procs.delete(id);
        this.setStatus(id, 'error', errMsg(e));
      });
      child.on('exit', (code, signal) => {
        this.procs.delete(id);
        this.clearHealth(id);
        if (this.stopping.has(id)) return;
        const tail = tailFile(path.join(d.logs, 'process.log'), 3).join(' ').slice(-300);
        this.host.log('warn', `[${id}] exited (${signal ?? code})`);
        this.setStatus(id, 'error', `Stopped unexpectedly (${signal ?? `exit ${code}`}). ${tail}`.trim());
      });

      const ok = await this.waitHealthy(id, 15_000);
      if (!this.procs.has(id)) throw new Error(this.status.get(id)?.detail ?? 'Process exited during start');
      this.setStatus(id, 'running', ok ? null : 'Running, but not answering health checks yet');
      this.scheduleHealth(id);
    } catch (e) {
      const child = this.procs.get(id);
      if (child) await this.kill(id, child);
      this.setStatus(id, 'error', errMsg(e));
      throw e;
    }
  }

  async stop(id: string, persist = true) {
    const rec = this.records[id];
    if (!rec) return;
    if (persist) {
      rec.desired = 'stopped';
      this.save();
    }
    const child = this.procs.get(id);
    if (!child) {
      if (this.status.get(id)?.status !== 'installing') this.setStatus(id, 'stopped');
      return;
    }
    this.setStatus(id, 'stopping');
    const spec = this.runSpec(id);
    this.stopping.add(id);
    if (spec.stop) {
      // Graceful shutdown hook (e.g. `docker compose down`) before the process is signalled.
      try {
        const ctx = await this.context(id);
        const { command, args, env } = buildCommand(spec.stop, ctx, scriptEnv(ctx));
        await runLogged(command, args, env, this.dirs(id).runtime, path.join(this.dirs(id).logs, 'process.log'), (spec.stop.timeoutSec ?? 60) * 1000);
      } catch (e) {
        this.host.log('warn', `[${id}] stop command failed: ${errMsg(e)}`);
      }
    }
    if (this.procs.has(id)) await this.kill(id, child);
    else this.stopping.delete(id);
    this.setStatus(id, 'stopped');
  }

  /** The run spec for this platform (platformRun overrides run). */
  private runSpec(id: string) {
    const m = this.records[id].manifest;
    return m.platformRun?.[process.platform as Platform] ?? m.run;
  }

  /** Resolves a path that must stay inside this plugin's folders. */
  private insidePlugin(id: string, p: string) {
    const full = path.resolve(p);
    if (!full.startsWith(path.resolve(this.dirs(id).root) + path.sep)) throw new Error(`${p} must be inside the plugin folder`);
    return full;
  }

  async restart(id: string) {
    await this.stop(id, false);
    await this.start(id);
  }

  private async kill(id: string, child: ChildProcess) {
    this.stopping.add(id);
    this.clearHealth(id);
    const exited = new Promise<void>((r) => (child.exitCode !== null ? r() : child.once('exit', () => r())));
    if (process.platform === 'win32' && child.pid) {
      execFile('taskkill', ['/pid', String(child.pid), '/T', '/F'], () => {});
    } else {
      child.kill('SIGTERM');
    }
    const timeout = setTimeout(() => child.kill('SIGKILL'), 10_000);
    await exited;
    clearTimeout(timeout);
    this.procs.delete(id);
    this.stopping.delete(id);
  }

  async stopAll() {
    await Promise.all([...this.procs.keys()].map((id) => this.stop(id, false).catch(() => {})));
  }

  async autostart() {
    for (const [id, rec] of Object.entries(this.records)) {
      if (rec.desired === 'running') this.start(id, false).catch((e) => this.host.log('error', `[${id}] ${errMsg(e)}`));
    }
  }

  private async probe(id: string): Promise<boolean> {
    const h = this.records[id]?.manifest.health;
    if (!h) return true;
    const target = render(h.target, await this.context(id));
    try {
      if (h.type === 'http') {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 3000);
        const r = await fetch(target, { signal: ctrl.signal }).finally(() => clearTimeout(t));
        return r.status < 500;
      }
      const [hostPart, port] = target.split(':');
      return await new Promise<boolean>((res) => {
        const s = net.connect({ host: hostPart || '127.0.0.1', port: Number(port), timeout: 3000 }, () => {
          s.destroy();
          res(true);
        });
        s.on('error', () => res(false));
        s.on('timeout', () => (s.destroy(), res(false)));
      });
    } catch {
      return false;
    }
  }

  private async waitHealthy(id: string, ms: number) {
    const until = Date.now() + ms;
    while (Date.now() < until && this.procs.has(id)) {
      if (await this.probe(id)) return true;
      await new Promise((r) => setTimeout(r, 500));
    }
    return false;
  }

  private scheduleHealth(id: string) {
    const h = this.records[id]?.manifest.health;
    if (!h) return;
    const timer = setInterval(async () => {
      if (!this.procs.has(id)) return this.clearHealth(id);
      const ok = await this.probe(id);
      const cur = this.status.get(id);
      const detail = ok ? null : 'Not answering health checks';
      if (cur?.status === 'running' && cur.detail !== detail) this.setStatus(id, 'running', detail);
    }, (h.intervalSec ?? 30) * 1000);
    this.healthTimers.set(id, timer);
  }
  private clearHealth(id: string) {
    clearInterval(this.healthTimers.get(id));
    this.healthTimers.delete(id);
  }

  // ───────────── Settings, actions, logs ─────────────

  async updateSettings(id: string, input: Record<string, any>) {
    const rec = this.get(id).record;
    const next = sanitizeSettings(rec.manifest, { ...rec.settings, ...input });
    const changed = (rec.manifest.settings ?? []).filter((s) => next[s.key] !== rec.settings[s.key]);
    rec.settings = next;
    this.save();
    this.host.onChange(id);
    if (this.procs.has(id) && changed.some((s) => s.restart !== false)) await this.restart(id);
    return next;
  }

  async runAction(id: string, actionId: string) {
    const rec = this.get(id).record;
    const a = rec.manifest.actions?.find((x) => x.id === actionId);
    if (!a) throw new Error('Unknown action');
    if (a.platforms && !a.platforms.includes(process.platform as Platform)) throw new Error(`${a.label} isn't available on this server's platform`);
    const ctx = await this.renderTemplates(id);
    const run = this.runSpec(id);
    const { command, args, env } = buildCommand({ command: a.command, args: a.args, env: { ...(run.env ?? {}), ...(a.env ?? {}) } }, ctx, scriptEnv(ctx));
    const d = this.dirs(id);
    const log = path.join(d.logs, 'actions.log');
    ensureDir(d.logs);
    fs.appendFileSync(log, `\n── ${new Date().toISOString()}  ${a.label}\n`);
    if (a.background) {
      runLogged(command, args, env, d.runtime, log, (a.timeoutSec ?? 6 * 3600) * 1000)
        .then((code) => fs.appendFileSync(log, `── ${a.label} finished (exit ${code})\n`))
        .catch((e) => fs.appendFileSync(log, `── ${a.label} failed: ${errMsg(e)}\n`));
      return { code: 0, output: `${a.label} started. Follow it in Logs › Actions.` };
    }
    return await new Promise<{ code: number; output: string }>((res) => {
      execFile(command, args, { cwd: d.runtime, env, timeout: Math.min(a.timeoutSec ?? 120, 600) * 1000, maxBuffer: 4 * 1024 * 1024, windowsHide: true }, (err, so, se) => {
        const output = `${so ?? ''}${se ?? ''}`.trim();
        fs.appendFileSync(log, output + '\n');
        res({ code: err ? ((err as any).code ?? 1) : 0, output: output.slice(-8000) || (err ? errMsg(err) : 'Done.') });
      });
    });
  }

  async logs(id: string, logId: string, lines = 200) {
    const rec = this.get(id).record;
    const d = this.dirs(id);
    const builtIn: Record<string, string> = {
      process: path.join(d.logs, 'process.log'),
      install: path.join(d.logs, 'install.log'),
      actions: path.join(d.logs, 'actions.log'),
    };
    let file = builtIn[logId];
    if (!file) {
      const l = rec.manifest.logs?.find((x) => x.id === logId);
      if (!l) throw new Error('Unknown log');
      const p = path.resolve(render(l.path, await this.context(id)));
      if (!p.startsWith(path.resolve(d.root) + path.sep)) throw new Error('Log path must be inside the plugin folder');
      file = p;
    }
    return { lines: tailFile(file, Math.min(Math.max(lines, 1), 2000)) };
  }

  // ───────────── File transfer folders (every plugin has at least one) ─────────────

  /** Absolute paths of uploaded `file` settings, exposed to templates as {{files.<key>}}. */
  private settingFiles(id: string) {
    const rec = this.records[id];
    const out: Record<string, string> = {};
    for (const f of rec.manifest.settings ?? []) {
      if (f.type === 'file' && rec.settings[f.key]) {
        out[f.key] = path.join(this.dirs(id).data, 'settings', f.key, String(rec.settings[f.key])).replace(/\\/g, '/');
      }
    }
    return out;
  }

  private async folder(id: string, folderId?: string): Promise<{ root: string; spec: FolderSpec; single: boolean }> {
    const m = this.get(id).record.manifest;
    let spec: FolderSpec | undefined;
    let single = false;
    if (folderId?.startsWith('setting.')) {
      const f = m.settings?.find((x) => x.type === 'file' && settingFolderId(x.key) === folderId);
      if (!f) throw new Error('Unknown file setting');
      spec = { id: folderId, label: f.label, root: `{{dataDir}}/settings/${f.key}`, accept: f.accept, maxFileMB: f.maxFileMB ?? 10 };
      single = true;
    } else {
      const all = pluginFolders(m);
      spec = folderId ? all.find((f) => f.id === folderId) : all[0];
      if (!spec) throw new Error('Unknown folder');
    }
    const root = path.resolve(render(spec.root, await this.context(id)));
    if (!root.startsWith(path.resolve(this.dirs(id).root) + path.sep)) throw new Error('Folder must be inside the plugin folder');
    ensureDir(root, 0o755);
    return { root, spec, single };
  }

  private checkFile(spec: FolderSpec, rel: string, size: number) {
    const ext = path.extname(rel).toLowerCase();
    if (spec.accept?.length && !spec.accept.map((a) => a.toLowerCase()).includes(ext)) throw new Error(`${rel}: ${ext || 'this'} file type isn't allowed here`);
    const max = (spec.maxFileMB ?? 50) * 1024 * 1024;
    if (size > max + 64) throw new Error(`${rel} is larger than ${spec.maxFileMB ?? 50} MB`);
  }

  async listFiles(id: string, folderId?: string): Promise<{ root: string; files: FileEntry[] }> {
    const { root } = await this.folder(id, folderId);
    const files: FileEntry[] = [];
    const walk = (dir: string) => {
      for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
        if (files.length >= 5000) return;
        const full = path.join(dir, ent.name);
        if (ent.isDirectory()) walk(full);
        else if (ent.isFile() && !ent.name.endsWith('.part')) {
          const st = fs.statSync(full);
          files.push({ path: path.relative(root, full).replace(/\\/g, '/'), size: st.size, modified: st.mtime.toISOString() });
        }
      }
    };
    walk(root);
    files.sort((a, b) => a.path.localeCompare(b.path));
    return { root, files };
  }

  private write(root: string, rel: string, data: Uint8Array, single: boolean) {
    if (single) for (const f of fs.readdirSync(root)) fs.rmSync(path.join(root, f), { recursive: true, force: true });
    const dest = safeJoin(root, rel);
    ensureDir(path.dirname(dest), 0o755);
    const tmp = dest + '.part';
    fs.writeFileSync(tmp, data, { mode: 0o644 });
    fs.renameSync(tmp, dest);
  }

  /** Encrypted uploads from a remote client. */
  async receiveFiles(id: string, refs: UploadedFileRef[], folderId?: string) {
    const { root, spec, single } = await this.folder(id, folderId);
    const written: string[] = [];
    for (const ref of refs) {
      safeJoin(root, ref.path);
      this.checkFile(spec, ref.path, ref.size);
      if (!ref.object.startsWith(`${this.host.serverId()}/`)) throw new Error('Transfer belongs to another server');
      const cipher = await this.host.takeTransfer(ref.object);
      this.checkFile(spec, ref.path, cipher.length - 16);
      const plain = await openSealed(this.host.privateKey(), this.host.serverId(), ref.path, ref, cipher);
      this.write(root, ref.path, plain, single);
      written.push(ref.path);
    }
    this.host.log('info', `[${id}] received ${written.length} file(s)`);
    return { written };
  }

  /** Local writes from the desktop server app (same machine, so no encryption hop). */
  async writeLocalFiles(id: string, files: { path: string; data: Uint8Array }[], folderId?: string) {
    const { root, spec, single } = await this.folder(id, folderId);
    for (const f of files) {
      safeJoin(root, f.path);
      this.checkFile(spec, f.path, f.data.length);
      this.write(root, f.path, f.data, single);
    }
    return { written: files.map((f) => f.path) };
  }

  /** Reads a file for the desktop server app's Download button. */
  async readFile(id: string, rel: string, folderId?: string) {
    const { root, spec } = await this.folder(id, folderId);
    if (spec.download === false) throw new Error('Downloads are turned off for this folder');
    const full = safeJoin(root, rel);
    if (fs.statSync(full).size > 100 * 1024 * 1024) throw new Error('Files over 100 MB can’t be downloaded from the app');
    return new Uint8Array(fs.readFileSync(full));
  }

  /** Encrypts a file to the requesting client's one-time key and stages it for download. */
  async sendFile(id: string, rel: string, clientKey: JsonWebKey, folderId?: string) {
    const plain = await this.readFile(id, rel, folderId);
    const sealed = await seal(clientKey, this.host.serverId(), rel, plain);
    const object = await this.host.putTransfer(sealed.ciphertext);
    return { object, size: plain.length, epk: sealed.epk, iv: sealed.iv, salt: sealed.salt, sha256: sealed.sha256, path: rel };
  }

  async deleteFile(id: string, rel: string, folderId?: string) {
    const { root } = await this.folder(id, folderId);
    const target = safeJoin(root, rel);
    fs.rmSync(target, { force: true });
    let dir = path.dirname(target);
    while (dir !== root && dir.startsWith(root) && fs.readdirSync(dir).length === 0) {
      fs.rmdirSync(dir);
      dir = path.dirname(dir);
    }
    return { deleted: rel };
  }
}

/** Runs a process, appending its output to a log file. Resolves with the exit code. */
function runLogged(command: string, args: string[], env: Record<string, string>, cwd: string, logFile: string, timeoutMs: number): Promise<number> {
  ensureDir(path.dirname(logFile));
  const out = fs.openSync(logFile, 'a');
  const child = spawn(command, args, { cwd, env, stdio: ['ignore', out, out], windowsHide: true });
  fs.closeSync(out);
  return new Promise((res) => {
    const t = setTimeout(() => {
      if (process.platform === 'win32' && child.pid) execFile('taskkill', ['/pid', String(child.pid), '/T', '/F'], () => {});
      else child.kill('SIGKILL');
    }, timeoutMs);
    child.on('exit', (code) => (clearTimeout(t), res(code ?? 1)));
    child.on('error', (e) => {
      clearTimeout(t);
      fs.appendFileSync(logFile, `${errMsg(e)}\n`);
      res(1);
    });
  });
}

/**
 * One requirement install step: a shell string (sh -c / PowerShell), or { command, args } run
 * directly, where command may be "@node" to run a script shipped with the plugin.
 */
function runInstallStep(step: string | CommandSpec, ctx: Record<string, any>, logFile: string): Promise<number> {
  ensureDir(path.dirname(logFile));
  if (typeof step === 'string') {
    const cmd = render(step, ctx);
    fs.appendFileSync(logFile, `\n$ ${cmd}\n`);
    return process.platform === 'win32'
      ? runLogged('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', cmd], process.env as any, ctx.runtimeDir, logFile, 30 * 60_000)
      : runLogged('/bin/sh', ['-c', cmd], process.env as any, ctx.runtimeDir, logFile, 30 * 60_000);
  }
  const { command, args, env } = buildCommand(step, ctx, scriptEnv(ctx));
  fs.appendFileSync(logFile, `\n$ ${step.command} ${args.join(' ')}\n`);
  ensureDir(ctx.runtimeDir);
  return runLogged(command, args, env, ctx.runtimeDir, logFile, 30 * 60_000);
}

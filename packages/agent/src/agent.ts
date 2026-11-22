import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import type { SupabaseClient, RealtimeChannel } from '@supabase/supabase-js';
import {
  APP_VERSION,
  generateKeyPair,
  fingerprint,
  type CommandMap,
  type CommandRow,
  type CommandType,
  type InstalledPluginRow,
  type ServerRow,
  type ServerStatusRow,
  type UptimeRow,
} from '@easyserver/core';
import { createAgentClient, ensureSignedIn } from './supabase';
import { PluginManager } from './plugins';
import { cpuUsage, diskUsage, friendlyOsName, lanAddress } from './metrics';
import { homeDir, ensureDir, readJson, writeJson, errMsg, render, consoleLogger, type Logger } from './util';

interface Identity {
  serverId?: string;
  name?: string;
  publicJwk?: JsonWebKey;
  privateJwk?: JsonWebKey;
  settings?: { autoStartPlugins?: boolean };
}

export interface Snapshot {
  server: ServerRow | null;
  status: ServerStatusRow | null;
  plugins: InstalledPluginRow[];
  uptime: UptimeRow[];
  running: boolean;
}

export interface Member {
  user_id: string;
  created_at: string;
}

const HEARTBEAT_MS = 30_000;
const COMMAND_TTL_MS = 10 * 60_000;

export class AgentAlreadyRunning extends Error {}

/**
 * The server agent. Owns this machine's identity in Supabase, publishes status, executes
 * commands from paired clients, and supervises plugins. Used by both the CLI and the desktop
 * server app (which talks to it in-process instead of round-tripping through Supabase).
 */
export class Agent extends EventEmitter {
  readonly home = ensureDir(homeDir());
  private idFile = path.join(this.home, 'identity.json');
  private lockFile = path.join(this.home, 'agent.lock');
  private identity: Identity = readJson(this.idFile, {});
  sb!: SupabaseClient;
  uid = '';
  plugins: PluginManager;
  private channel: RealtimeChannel | null = null;
  private timers: NodeJS.Timeout[] = [];
  private startedAt: string | null = null;
  private server: ServerRow | null = null;
  private status: ServerStatusRow | null = null;
  private uptime: UptimeRow[] = [];
  private running = false;
  private inflight = new Set<string>();

  constructor(private log: Logger = consoleLogger) {
    super();
    this.plugins = new PluginManager({
      home: this.home,
      log: (l, m) => this.log(l, m),
      onChange: (id, removed) => this.onPluginChange(id, removed),
      isApprovedSource: async (url) => {
        const { data, error } = await this.sb.from('plugin_sources').select('id').eq('github_url', url).maybeSingle();
        if (error) throw error;
        return !!data;
      },
      takeTransfer: async (key) => {
        const { data, error } = await this.sb.storage.from('transfers').download(key);
        if (error) throw new Error(`Download failed: ${error.message}`);
        const bytes = new Uint8Array(await data.arrayBuffer());
        await this.sb.storage.from('transfers').remove([key]);
        return bytes;
      },
      putTransfer: async (bytes) => {
        const key = `${this.identity.serverId}/out/${crypto.randomUUID()}`;
        const { error } = await this.sb.storage.from('transfers').upload(key, new Blob([bytes as any]), { contentType: 'application/octet-stream' });
        if (error) throw new Error(`Upload failed: ${error.message}`);
        return key;
      },
      serverId: () => this.identity.serverId!,
      privateKey: () => this.identity.privateJwk!,
    });
  }

  // ───────────── Identity & pairing ─────────────

  async connect() {
    if (!this.sb) this.sb = await createAgentClient();
    this.uid = await ensureSignedIn(this.sb);
    return this.uid;
  }

  get serverId() {
    return this.identity.serverId ?? null;
  }
  get name() {
    return this.identity.name ?? null;
  }
  isSetUp() {
    return !!this.identity.serverId;
  }

  async keyFingerprint() {
    return this.identity.publicJwk ? fingerprint(this.identity.publicJwk) : null;
  }

  /** Step 1 of setup: register this machine under a name. Returns the first pairing code. */
  async setup(name: string): Promise<{ code: string; expiresAt: string }> {
    name = name.trim();
    if (!name || name.length > 64) throw new Error('Choose a name between 1 and 64 characters.');
    await this.connect();
    if (!this.identity.privateJwk) {
      const kp = await generateKeyPair();
      this.identity.publicJwk = kp.publicJwk;
      this.identity.privateJwk = kp.privateJwk;
    }
    if (!this.identity.serverId) {
      const { data, error } = await this.sb
        .from('servers')
        .insert({ name, hostname: os.hostname(), platform: process.platform, arch: process.arch, agent_version: APP_VERSION, public_key: this.identity.publicJwk })
        .select()
        .single();
      if (error) throw new Error(errMsg(error));
      this.identity.serverId = data.id;
    } else {
      await this.sb.from('servers').update({ name }).eq('id', this.identity.serverId);
    }
    this.identity.name = name;
    this.identity.settings ??= { autoStartPlugins: true };
    writeJson(this.idFile, this.identity);
    return this.newPairingCode();
  }

  async newPairingCode(): Promise<{ code: string; expiresAt: string }> {
    await this.connect();
    const { data, error } = await this.sb.rpc('create_pairing_code', { sid: this.serverId });
    if (error) throw new Error(errMsg(error));
    const row = Array.isArray(data) ? data[0] : data;
    return { code: row.code, expiresAt: row.expires_at };
  }

  async members(): Promise<Member[]> {
    await this.connect();
    const { data, error } = await this.sb.from('server_members').select('user_id, created_at').eq('server_id', this.serverId).order('created_at');
    if (error) throw new Error(errMsg(error));
    return data ?? [];
  }

  async revokeMember(userId: string) {
    const { error } = await this.sb.from('server_members').delete().eq('server_id', this.serverId).eq('user_id', userId);
    if (error) throw new Error(errMsg(error));
  }

  /** Resolves once at least one client has claimed a code. Setup can't finish before this. */
  async waitForClaim(signal?: AbortSignal): Promise<void> {
    await this.connect();
    const sid = this.serverId!;
    return new Promise((resolve, reject) => {
      let done = false;
      const finish = (err?: Error) => {
        if (done) return;
        done = true;
        clearInterval(poll);
        this.sb.removeChannel(ch);
        err ? reject(err) : resolve();
      };
      const check = async () => {
        const { count } = await this.sb.from('server_members').select('user_id', { count: 'exact', head: true }).eq('server_id', sid);
        if ((count ?? 0) > 0) finish();
      };
      const ch = this.sb
        .channel(`claim:${sid}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'server_members', filter: `server_id=eq.${sid}` }, () => finish())
        .subscribe();
      const poll = setInterval(check, 3000);
      check();
      signal?.addEventListener('abort', () => finish(new Error('cancelled')));
    });
  }

  async hasMembers() {
    if (!this.serverId) return false;
    await this.connect();
    const { count } = await this.sb.from('server_members').select('user_id', { count: 'exact', head: true }).eq('server_id', this.serverId);
    return (count ?? 0) > 0;
  }

  /** Deletes this server from Supabase and forgets it locally. Plugins are stopped but kept on disk. */
  async reset() {
    await this.stop();
    if (this.serverId) {
      await this.connect();
      await this.sb.from('servers').delete().eq('id', this.serverId);
    }
    this.identity = {};
    fs.rmSync(this.idFile, { force: true });
    fs.rmSync(path.join(this.home, 'session'), { recursive: true, force: true });
  }

  // ───────────── Run loop ─────────────

  private acquireLock() {
    try {
      const pid = Number(fs.readFileSync(this.lockFile, 'utf8'));
      if (pid && pid !== process.pid) {
        try {
          process.kill(pid, 0);
          throw new AgentAlreadyRunning(`EasyServer is already running on this computer (process ${pid}).`);
        } catch (e) {
          if (e instanceof AgentAlreadyRunning) throw e;
        }
      }
    } catch (e) {
      if (e instanceof AgentAlreadyRunning) throw e;
    }
    fs.writeFileSync(this.lockFile, String(process.pid));
  }

  async start() {
    if (this.running) return;
    if (!this.serverId) throw new Error('This server is not set up yet. Run `easyserver setup` first.');
    this.acquireLock();
    await this.connect();
    this.startedAt = new Date().toISOString();
    const { data, error } = await this.sb
      .from('servers')
      .update({
        hostname: os.hostname(),
        platform: process.platform,
        arch: process.arch,
        agent_version: APP_VERSION,
        public_key: this.identity.publicJwk,
        started_at: this.startedAt,
        last_seen_at: this.startedAt,
      })
      .eq('id', this.serverId)
      .select()
      .single();
    if (error) throw new Error(`Couldn't reach Supabase: ${errMsg(error)}`);
    this.server = data;
    this.running = true;
    this.log('info', `EasyServer agent running as "${data.name}" (${this.serverId})`);

    await this.syncAllPlugins();
    this.subscribe();
    await this.heartbeat();
    this.timers.push(setInterval(() => this.heartbeat().catch((e) => this.log('warn', `heartbeat: ${errMsg(e)}`)), HEARTBEAT_MS));
    this.timers.push(setInterval(() => this.drainBacklog(), 20_000));
    this.timers.push(setInterval(() => this.prune(), 6 * 3600_000));
    this.drainBacklog();
    this.prune();
    if (this.identity.settings?.autoStartPlugins !== false) await this.plugins.autostart();
    this.emit('change');
  }

  async stop() {
    if (!this.running) return;
    this.running = false;
    this.timers.forEach(clearInterval);
    this.timers = [];
    if (this.channel) await this.sb.removeChannel(this.channel);
    this.channel = null;
    await this.plugins.stopAll();
    await this.syncAllPlugins().catch(() => {});
    await this.sb.from('servers').update({ last_seen_at: new Date(Date.now() - 120_000).toISOString() }).eq('id', this.serverId);
    try {
      if (Number(fs.readFileSync(this.lockFile, 'utf8')) === process.pid) fs.rmSync(this.lockFile);
    } catch {}
    this.emit('change');
  }

  private subscribe() {
    const sid = this.serverId!;
    this.channel = this.sb
      .channel(`agent:${sid}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'commands', filter: `server_id=eq.${sid}` }, (p) =>
        this.handleRow(p.new as CommandRow),
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') this.drainBacklog();
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') this.log('warn', `realtime: ${status}, falling back to polling`);
      });
  }

  private async drainBacklog() {
    if (!this.running) return;
    const { data } = await this.sb
      .from('commands')
      .select('*')
      .eq('server_id', this.serverId)
      .eq('status', 'pending')
      .order('created_at')
      .limit(50);
    for (const row of data ?? []) this.handleRow(row as CommandRow);
  }

  private async handleRow(row: CommandRow) {
    if (row.status !== 'pending' || this.inflight.has(row.id)) return;
    this.inflight.add(row.id);
    try {
      const { data: claimed } = await this.sb
        .from('commands')
        .update({ status: 'running', updated_at: new Date().toISOString() })
        .eq('id', row.id)
        .eq('status', 'pending')
        .select('id')
        .maybeSingle();
      if (!claimed) return;
      if (Date.now() - Date.parse(row.created_at) > COMMAND_TTL_MS) {
        await this.finish(row.id, null, 'This request expired before the server received it.');
        return;
      }
      this.log('info', `→ ${row.type}`);
      try {
        const result = await this.execute(row.type, row.payload ?? {});
        await this.finish(row.id, result ?? null, null);
      } catch (e) {
        this.log('warn', `${row.type} failed: ${errMsg(e)}`);
        await this.finish(row.id, null, errMsg(e));
      }
    } finally {
      this.inflight.delete(row.id);
    }
  }

  private async finish(id: string, result: any, error: string | null) {
    await this.sb
      .from('commands')
      .update({ status: error ? 'error' : 'done', result, error, updated_at: new Date().toISOString() })
      .eq('id', id);
  }

  /** Single entry point for everything a client (remote or local) can ask for. */
  async execute<T extends CommandType>(type: T, payload: CommandMap[T]): Promise<any> {
    const p = payload as any;
    switch (type) {
      case 'server.ping':
        return { pong: new Date().toISOString() };
      case 'server.rename': {
        const name = String(p.name ?? '').trim();
        if (!name || name.length > 64) throw new Error('Choose a name between 1 and 64 characters.');
        const { data, error } = await this.sb.from('servers').update({ name }).eq('id', this.serverId).select().single();
        if (error) throw new Error(errMsg(error));
        this.identity.name = name;
        writeJson(this.idFile, this.identity);
        this.server = data;
        this.emit('change');
        return { name };
      }
      case 'server.settings': {
        const s = { ...(this.identity.settings ?? {}), autoStartPlugins: p.settings?.autoStartPlugins !== false };
        this.identity.settings = s;
        writeJson(this.idFile, this.identity);
        const { data } = await this.sb.from('servers').update({ settings: s }).eq('id', this.serverId).select().single();
        if (data) this.server = data;
        this.emit('change');
        return s;
      }
      case 'plugin.install': {
        const st = await this.plugins.install(String(p.sourceUrl));
        await this.sb.from('plugin_events').insert({ plugin_id: st.id, server_id: this.serverId, kind: 'install' });
        return { pluginId: st.id };
      }
      case 'plugin.uninstall':
        await this.plugins.uninstall(p.pluginId, !!p.keepData);
        await this.sb.from('plugin_events').insert({ plugin_id: p.pluginId, server_id: this.serverId, kind: 'uninstall' });
        return {};
      case 'plugin.start':
        await this.plugins.start(p.pluginId);
        return {};
      case 'plugin.stop':
        await this.plugins.stop(p.pluginId);
        return {};
      case 'plugin.restart':
        await this.plugins.restart(p.pluginId);
        return {};
      case 'plugin.settings':
        return { settings: await this.plugins.updateSettings(p.pluginId, p.settings ?? {}) };
      case 'plugin.action':
        return await this.plugins.runAction(p.pluginId, p.actionId);
      case 'plugin.logs':
        return await this.plugins.logs(p.pluginId, p.logId, p.lines);
      case 'plugin.files.list':
        return await this.plugins.listFiles(p.pluginId, p.folder);
      case 'plugin.files.upload':
        return await this.plugins.receiveFiles(p.pluginId, p.files ?? [], p.folder);
      case 'plugin.files.delete':
        return await this.plugins.deleteFile(p.pluginId, p.path, p.folder);
      case 'plugin.files.download':
        return await this.plugins.sendFile(p.pluginId, p.path, p.publicKey, p.folder);
      default:
        throw new Error(`Unknown command: ${type}`);
    }
  }

  // ───────────── State mirroring ─────────────

  private pluginRow(id: string): InstalledPluginRow {
    const st = this.plugins.get(id);
    return {
      server_id: this.serverId!,
      plugin_id: id,
      name: st.record.manifest.name,
      version: st.record.manifest.version,
      source_url: st.record.sourceUrl,
      manifest: st.record.manifest,
      settings: st.record.settings,
      status: st.status,
      status_detail: st.detail,
      links: (st.record.manifest.links ?? []).map((l) => ({
        label: l.label,
        url: render(l.url, { host: lanAddress(), hostname: os.hostname(), settings: st.record.settings }),
      })),
      installed_at: st.record.installedAt,
      updated_at: new Date().toISOString(),
    };
  }

  /**
   * Mirrors a plugin to Supabase. Writes for one plugin go out one at a time, each built from the
   * state at send time, so "stopping" can never land after "stopped".
   */
  private syncChain = new Map<string, Promise<void>>();
  private onPluginChange(id: string, _removed?: boolean) {
    this.emit('change');
    if (!this.sb || !this.serverId) return;
    const next = (this.syncChain.get(id) ?? Promise.resolve()).then(async () => {
      const exists = this.plugins.list().some((p) => p.id === id);
      const { error } = exists
        ? await this.sb.from('installed_plugins').upsert(this.pluginRow(id))
        : await this.sb.from('installed_plugins').delete().eq('server_id', this.serverId).eq('plugin_id', id);
      if (error) this.log('warn', `sync ${id}: ${error.message}`);
    });
    this.syncChain.set(id, next.catch(() => {}));
  }

  private async syncAllPlugins() {
    const rows = this.plugins.list().map((p) => this.pluginRow(p.id));
    if (rows.length) await this.sb.from('installed_plugins').upsert(rows);
    const ids = new Set(rows.map((r) => r.plugin_id));
    const { data } = await this.sb.from('installed_plugins').select('plugin_id').eq('server_id', this.serverId);
    const stale = (data ?? []).map((r) => r.plugin_id).filter((x) => !ids.has(x));
    if (stale.length) await this.sb.from('installed_plugins').delete().eq('server_id', this.serverId).in('plugin_id', stale);
  }

  private async heartbeat() {
    const now = new Date();
    const disk = await diskUsage(this.home);
    const status: ServerStatusRow = {
      server_id: this.serverId!,
      cpu: cpuUsage(),
      mem_used: os.totalmem() - os.freemem(),
      mem_total: os.totalmem(),
      disk_used: disk?.used ?? null,
      disk_total: disk?.total ?? null,
      load_avg: os.loadavg()[0],
      os_uptime: Math.round(os.uptime()),
      os_name: await friendlyOsName(),
      updated_at: now.toISOString(),
    };
    this.status = status;
    const minute = new Date(Math.floor(now.getTime() / 60_000) * 60_000).toISOString();
    const [srv] = await Promise.all([
      this.sb.from('servers').update({ last_seen_at: now.toISOString() }).eq('id', this.serverId).select().single(),
      this.sb.from('server_status').upsert(status),
      this.sb.from('server_heartbeats').upsert({ server_id: this.serverId, minute }, { ignoreDuplicates: true }),
    ]);
    if (srv.data) this.server = srv.data;
    const up = await this.sb.rpc('server_uptime', { sid: this.serverId });
    if (up.data) this.uptime = up.data;
    this.emit('change');
  }

  private async prune() {
    const cutoff = new Date(Date.now() - 31 * 86400_000).toISOString();
    await this.sb.from('server_heartbeats').delete().eq('server_id', this.serverId).lt('minute', cutoff);
    await this.sb.from('commands').delete().eq('server_id', this.serverId).lt('created_at', new Date(Date.now() - 7 * 86400_000).toISOString());
    // Downloads the client never collected.
    const { data: stale } = await this.sb.storage.from('transfers').list(`${this.serverId}/out`, { limit: 1000 });
    const old = (stale ?? []).filter((o: any) => Date.now() - Date.parse(o.created_at ?? 0) > 3600_000).map((o: any) => `${this.serverId}/out/${o.name}`);
    if (old.length) await this.sb.storage.from('transfers').remove(old);
  }

  snapshot(): Snapshot {
    return {
      server: this.server,
      status: this.status,
      plugins: this.isSetUp() ? this.plugins.list().map((p) => this.pluginRow(p.id)) : [],
      uptime: this.uptime,
      running: this.running,
    };
  }
}

import { createClient, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js';
import {
  SUPABASE_KEY,
  SUPABASE_URL,
  seal,
  open as openSealed,
  generateKeyPair,
  type CommandMap,
  type CommandRow,
  type CommandType,
  type InstalledPluginRow,
  type ServerRow,
  type UploadedFileRef,
} from '@easyserver/core';
import type { Account, Backend, BackendState, LocalFile } from './types';

const SELECTED_KEY = 'easyserver.selectedServer';
const storage = {
  get: (k: string) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set: (k: string, v: string | null) => {
    try {
      v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v);
    } catch {}
  },
};

const msg = (e: any) => e?.message ?? String(e);

/**
 * Client app backend: everything goes through Supabase. The client never connects to a
 * server directly; it writes commands and reads the state the agent publishes.
 */
export class ClientBackend implements Backend {
  mode = 'client' as const;
  sb: SupabaseClient;
  private push!: (p: Partial<BackendState>) => void;
  private servers: ServerRow[] = [];
  private selectedId: string | null = null;
  private plugins: InstalledPluginRow[] = [];
  private globalCh: RealtimeChannel | null = null;
  private serverCh: RealtimeChannel | null = null;
  private timers: any[] = [];
  private pendingMfaFactor: string | null = null;

  constructor() {
    this.sb = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, storageKey: 'easyserver.auth' },
    });
  }

  async init(push: (p: Partial<BackendState>) => void) {
    this.push = push;
    const { data } = await this.sb.auth.getSession();
    if (!data.session) {
      const res = await this.sb.auth.signInAnonymously();
      if (res.error) throw new Error(`Couldn't connect: ${res.error.message}`);
    }
    await this.refreshAccount();
    await this.afterSignIn();
    this.timers.push(setInterval(() => this.refreshSelected(), 30_000));
    this.timers.push(setInterval(() => this.refreshUptime(), 60_000));
  }

  private async afterSignIn() {
    this.subscribeGlobal();
    await this.loadServers();
    const saved = storage.get(SELECTED_KEY);
    const pick = this.servers.find((s) => s.id === saved)?.id ?? this.servers[0]?.id ?? null;
    if (pick) await this.select(pick);
    else this.push({ selectedId: null, status: null, plugins: [], uptime: [] });
  }

  private async refreshAccount() {
    const { data } = await this.sb.auth.getUser();
    const u = data.user;
    if (!u) return this.push({ account: null });
    const f = await this.sb.auth.mfa.listFactors();
    const totp = f.data?.totp?.[0] ?? f.data?.all?.find((x: any) => x.factor_type === 'totp') ?? null;
    const account: Account = {
      userId: u.id,
      email: u.email ?? null,
      isAnonymous: !!(u as any).is_anonymous,
      mfa: totp ? { factorId: totp.id, verified: totp.status === 'verified' } : null,
    };
    this.push({ account });
  }

  private async loadServers() {
    const { data, error } = await this.sb.from('servers').select('*').order('name');
    if (error) throw new Error(msg(error));
    this.servers = data as ServerRow[];
    this.push({ servers: this.servers });
  }

  private subscribeGlobal() {
    if (this.globalCh) this.sb.removeChannel(this.globalCh);
    this.globalCh = this.sb
      .channel('client-global')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'servers' }, (p) => {
        if (p.eventType === 'DELETE') {
          this.servers = this.servers.filter((s) => s.id !== (p.old as any).id);
        } else {
          const row = p.new as ServerRow;
          const i = this.servers.findIndex((s) => s.id === row.id);
          this.servers = i >= 0 ? this.servers.map((s) => (s.id === row.id ? row : s)) : [...this.servers, row];
        }
        this.push({ servers: [...this.servers].sort((a, b) => a.name.localeCompare(b.name)) });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'server_members' }, () => this.loadServers().catch(() => {}))
      .subscribe();
  }

  async select(serverId: string) {
    this.selectedId = serverId;
    storage.set(SELECTED_KEY, serverId);
    this.push({ selectedId: serverId, status: null, plugins: [], uptime: [] });
    if (this.serverCh) await this.sb.removeChannel(this.serverCh);
    this.serverCh = this.sb
      .channel(`client-server:${serverId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'installed_plugins', filter: `server_id=eq.${serverId}` }, (p) => {
        if (this.selectedId !== serverId) return;
        if (p.eventType === 'DELETE') {
          this.plugins = this.plugins.filter((x) => x.plugin_id !== (p.old as any).plugin_id);
        } else {
          const row = p.new as InstalledPluginRow;
          const exists = this.plugins.some((x) => x.plugin_id === row.plugin_id);
          this.plugins = exists ? this.plugins.map((x) => (x.plugin_id === row.plugin_id ? row : x)) : [...this.plugins, row];
        }
        this.push({ plugins: sortPlugins(this.plugins) });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'server_status', filter: `server_id=eq.${serverId}` }, (p) => {
        if (this.selectedId === serverId && p.new) this.push({ status: p.new as any });
      })
      .subscribe();
    await this.refreshSelected();
    await this.refreshUptime();
  }

  private async refreshSelected() {
    const sid = this.selectedId;
    if (!sid) return;
    const [st, pl] = await Promise.all([
      this.sb.from('server_status').select('*').eq('server_id', sid).maybeSingle(),
      this.sb.from('installed_plugins').select('*').eq('server_id', sid),
    ]);
    if (sid !== this.selectedId) return;
    this.plugins = (pl.data as InstalledPluginRow[]) ?? [];
    this.push({ status: (st.data as any) ?? null, plugins: sortPlugins(this.plugins) });
  }

  private async refreshUptime() {
    const sid = this.selectedId;
    if (!sid) return;
    const { data } = await this.sb.rpc('server_uptime', { sid });
    if (sid === this.selectedId) this.push({ uptime: data ?? [] });
  }

  async send<T extends CommandType>(type: T, payload: CommandMap[T], opts?: { timeoutMs?: number }) {
    const sid = this.selectedId;
    if (!sid) throw new Error('Choose a server first.');
    const { data, error } = await this.sb.from('commands').insert({ server_id: sid, type, payload }).select('id').single();
    if (error) throw new Error(msg(error));
    const id = data.id as string;
    const timeout = opts?.timeoutMs ?? 60_000;
    return await new Promise((resolve, reject) => {
      let done = false;
      const finish = (row: Partial<CommandRow> | null, err?: string) => {
        if (done) return;
        done = true;
        clearInterval(poll);
        clearTimeout(timer);
        this.sb.removeChannel(ch);
        if (err) reject(new Error(err));
        else if (row?.status === 'error') reject(new Error(row.error ?? 'The server reported an error.'));
        else resolve(row?.result ?? null);
      };
      const check = (row: Partial<CommandRow> | null) => {
        if (row && (row.status === 'done' || row.status === 'error')) finish(row);
      };
      const ch = this.sb
        .channel(`cmd:${id}`)
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'commands', filter: `id=eq.${id}` }, (p) => check(p.new as any))
        .subscribe();
      const poll = setInterval(async () => {
        const { data: row } = await this.sb.from('commands').select('status,result,error').eq('id', id).maybeSingle();
        check(row as any);
      }, 2000);
      const timer = setTimeout(() => finish(null, "The server didn't respond. Check that it's online."), timeout);
    });
  }

  async download(pluginId: string, path: string, folder?: string) {
    const sid = this.selectedId;
    if (!sid) throw new Error('Choose a server first.');
    // A fresh key pair per download: only this window can open what the server sends back.
    const kp = await generateKeyPair();
    const ref = await this.send('plugin.files.download', { pluginId, path, folder, publicKey: kp.publicJwk }, { timeoutMs: 180_000 });
    const { data, error } = await this.sb.storage.from('transfers').download(ref.object);
    await this.sb.storage.from('transfers').remove([ref.object]);
    if (error) throw new Error(`Download failed: ${error.message}`);
    return await openSealed(kp.privateJwk, sid, path, ref, new Uint8Array(await data.arrayBuffer()));
  }

  async upload(pluginId: string, files: LocalFile[], onProgress?: (d: number, t: number) => void, folder?: string) {
    const sid = this.selectedId;
    const server = this.servers.find((s) => s.id === sid);
    if (!sid || !server?.public_key) throw new Error("This server hasn't published its encryption key yet. Make sure it's online.");
    const total = files.length;
    let done = 0;
    for (let i = 0; i < files.length; i += 20) {
      const batch = files.slice(i, i + 20);
      const refs: UploadedFileRef[] = [];
      try {
        for (const f of batch) {
          const sealed = await seal(server.public_key, sid, f.path, f.data);
          const object = `${sid}/${crypto.randomUUID()}`;
          const up = await this.sb.storage
            .from('transfers')
            .upload(object, new Blob([sealed.ciphertext], { type: 'application/octet-stream' }), { contentType: 'application/octet-stream', upsert: false });
          if (up.error) throw new Error(`Upload failed: ${up.error.message}`);
          refs.push({ path: f.path, object, size: f.data.length, epk: sealed.epk, iv: sealed.iv, salt: sealed.salt, sha256: sealed.sha256 });
          onProgress?.(++done * 0.5, total);
        }
        await this.send('plugin.files.upload', { pluginId, files: refs, folder }, { timeoutMs: 180_000 });
        onProgress?.((done = i + batch.length), total);
      } catch (e) {
        if (refs.length) await this.sb.storage.from('transfers').remove(refs.map((r) => r.object));
        throw e;
      }
    }
  }

  async sources() {
    const { data, error } = await this.sb.from('plugin_sources').select('github_url').order('id');
    if (error) throw new Error(msg(error));
    return (data ?? []).map((r) => r.github_url as string);
  }

  onSourcesChanged(cb: () => void) {
    const ch = this.sb.channel('sources').on('postgres_changes', { event: '*', schema: 'public', table: 'plugin_sources' }, cb).subscribe();
    return () => {
      this.sb.removeChannel(ch);
    };
  }

  async installStats() {
    const { data } = await this.sb.rpc('plugin_install_stats');
    return data ?? [];
  }

  // ───────────── Pairing ─────────────

  async claimCode(code: string) {
    const { data, error } = await this.sb.rpc('claim_pairing_code', { input_code: code });
    if (error) throw new Error(msg(error));
    await this.loadServers();
    await this.select(data as string);
    return data as string;
  }

  async leave(serverId: string) {
    const uid = (await this.sb.auth.getUser()).data.user?.id;
    const { error } = await this.sb.from('server_members').delete().eq('server_id', serverId).eq('user_id', uid);
    if (error) throw new Error(msg(error));
    await this.loadServers();
    const next = this.servers[0]?.id;
    if (next) await this.select(next);
    else {
      this.selectedId = null;
      storage.set(SELECTED_KEY, null);
      this.push({ selectedId: null, status: null, plugins: [], uptime: [] });
    }
  }

  // ───────────── Account & 2FA ─────────────

  async signUpWithEmail(email: string, password: string) {
    const { error } = await this.sb.auth.updateUser({ email, password });
    if (error) throw new Error(msg(error));
    await this.refreshAccount();
    return 'Check your inbox to confirm your email address.';
  }

  async signIn(email: string, password: string): Promise<'ok' | 'mfa'> {
    const { error } = await this.sb.auth.signInWithPassword({ email, password });
    if (error) throw new Error(msg(error));
    const aal = await this.sb.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal.data?.nextLevel === 'aal2' && aal.data.currentLevel !== 'aal2') {
      const f = await this.sb.auth.mfa.listFactors();
      this.pendingMfaFactor = f.data?.totp?.[0]?.id ?? null;
      return 'mfa';
    }
    await this.refreshAccount();
    await this.afterSignIn();
    return 'ok';
  }

  async verifySignInMfa(code: string) {
    if (!this.pendingMfaFactor) throw new Error('No two-factor sign-in in progress.');
    const { error } = await this.sb.auth.mfa.challengeAndVerify({ factorId: this.pendingMfaFactor, code });
    if (error) throw new Error(msg(error));
    this.pendingMfaFactor = null;
    await this.refreshAccount();
    await this.afterSignIn();
  }

  async signOut() {
    await this.sb.auth.signOut();
    storage.set(SELECTED_KEY, null);
    const res = await this.sb.auth.signInAnonymously();
    if (res.error) throw new Error(msg(res.error));
    this.servers = [];
    this.selectedId = null;
    await this.refreshAccount();
    await this.afterSignIn();
  }

  async enrollMfa() {
    const existing = await this.sb.auth.mfa.listFactors();
    for (const f of existing.data?.all ?? []) if (f.status !== 'verified') await this.sb.auth.mfa.unenroll({ factorId: f.id });
    const { data, error } = await this.sb.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'EasyServer' });
    if (error) throw new Error(msg(error));
    return { factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret };
  }

  async verifyMfa(factorId: string, code: string) {
    const { error } = await this.sb.auth.mfa.challengeAndVerify({ factorId, code });
    if (error) throw new Error(msg(error));
    await this.refreshAccount();
  }

  async disableMfa(factorId: string) {
    const { error } = await this.sb.auth.mfa.unenroll({ factorId });
    if (error) throw new Error(msg(error));
    await this.refreshAccount();
  }
}

export function sortPlugins(list: InstalledPluginRow[]) {
  return [...list].sort((a, b) => a.name.localeCompare(b.name));
}

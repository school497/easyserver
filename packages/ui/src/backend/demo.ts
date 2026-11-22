import type { CommandMap, CommandType, InstalledPluginRow, PluginManifest, ServerRow } from '@easyserver/core';
import { defaultSettings, sanitizeSettings } from '@easyserver/core';
import apacheManifest from '../../../../plugins/apache/easyserver.plugin.json';
import apacheIcon from '../../../../plugins/apache/icon.svg?url';
import type { Backend, BackendState, LocalFile, Member, SetupState } from './types';

/**
 * Demo backend: realistic fake data so the UI can be previewed (and designed) without a
 * Supabase project. Enabled with ?demo in the URL, or automatically when Supabase isn't configured.
 */
const now = Date.now();
const iso = (ms: number) => new Date(ms).toISOString();

function fake(id: string, name: string, category: PluginManifest['category'], subtitle: string, description: string): PluginManifest {
  return {
    schema: 1,
    id,
    name,
    version: '1.0.0',
    developer: 'Example Developer',
    subtitle,
    description,
    category,
    icon: 'icon.png',
    platforms: ['darwin', 'linux', 'win32'],
    files: ['icon.png'],
    run: { command: 'true' },
    settings: [{ key: 'port', label: 'Port', type: 'port', default: 9000 }],
  };
}

const bundledIcons = import.meta.glob('../../../../plugins/*/icon.svg', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
// Every plugin bundled in this repo appears in the demo store with its real manifest and icon.
const bundled = Object.entries(import.meta.glob('../../../../plugins/*/easyserver.plugin.json', { eager: true, import: 'default' }) as Record<string, PluginManifest>)
  .filter(([file]) => !file.includes('/apache/'))
  .map(([file, manifest]) => {
    const slug = file.split('/').slice(-2)[0];
    return { sourceUrl: `https://github.com/example/easyserver-plugins/tree/main/${slug}`, manifest, iconUrl: bundledIcons[`../../../../plugins/${slug}/icon.svg`] ?? null };
  });

const catalog: { sourceUrl: string; manifest: PluginManifest; iconUrl: string | null }[] = [
  { sourceUrl: 'https://github.com/example/easyserver-plugins/tree/main/apache', manifest: apacheManifest as PluginManifest, iconUrl: apacheIcon },
  ...bundled,
  { sourceUrl: 'https://github.com/example/reverse-proxy', manifest: fake('dev.example.proxy', 'Reverse Proxy', 'web-servers', 'Route domains to local apps', 'Point several domain names at different apps running on this computer.'), iconUrl: null },
  {
    sourceUrl: 'https://github.com/example/python-worker',
    manifest: {
      ...fake('dev.example.python', 'Python Worker', 'computing', 'Run scripts on a schedule', 'Keep Python scripts running in the background and restart them if they crash.'),
      settings: [
        { key: 'script', label: 'Script to Run', type: 'string', default: 'main.py', group: 'Script', placeholder: 'main.py', required: true },
        { key: 'args', label: 'Arguments', type: 'list', default: ['--verbose'], group: 'Script', placeholder: 'Add an argument' },
        { key: 'env', label: 'Environment', type: 'text', default: 'DEBUG=0\nREGION=eu', rows: 3, group: 'Script', description: 'One NAME=value per line.' },
        { key: 'apiKey', label: 'API Key', type: 'password', default: '', group: 'Script' },
        { key: 'schedule', label: 'Run', type: 'select', default: 'always', group: 'Schedule', options: [{ label: 'Always', value: 'always' }, { label: 'Hourly', value: 'hourly' }, { label: 'Daily', value: 'daily' }] },
        { key: 'hour', label: 'Hour of Day', type: 'slider', default: 3, min: 0, max: 23, unit: ':00', group: 'Schedule', visibleIf: { key: 'schedule', equals: 'daily' } },
        { key: 'days', label: 'Days', type: 'multiselect', default: ['mon', 'tue', 'wed', 'thu', 'fri'], group: 'Schedule', options: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((d) => ({ label: d[0].toUpperCase() + d.slice(1), value: d })) },
        { key: 'memory', label: 'Memory Limit', type: 'slider', default: 512, min: 128, max: 4096, step: 128, unit: 'MB', group: 'Limits' },
        { key: 'alerts', label: 'Email Me on Crash', type: 'email', default: '', group: 'Limits', placeholder: 'you@example.com' },
        { key: 'webhook', label: 'Webhook', type: 'url', default: '', group: 'Limits', placeholder: 'https://' },
        { key: 'accent', label: 'Dashboard Color', type: 'color', default: '#0A84FF', group: 'Limits' },
        { key: 'requirements', label: 'requirements.txt', type: 'file', default: '', accept: ['.txt'], group: 'Limits' },
      ],
      folders: [
        { id: 'scripts', label: 'Scripts', root: '{{dataDir}}/scripts', accept: ['.py', '.txt', '.json'] },
        { id: 'output', label: 'Output', root: '{{dataDir}}/output', description: 'Files your scripts write. Download them from here.' },
      ],
    },
    iconUrl: null,
  },
  { sourceUrl: 'https://github.com/example/jobs', manifest: fake('dev.example.jobs', 'Job Scheduler', 'computing', 'Cron, without the syntax', 'Schedule commands to run every hour, day or week, with logs for every run.'), iconUrl: null },
  { sourceUrl: 'https://github.com/example/git', manifest: fake('dev.example.git', 'Git Hosting', 'developer-tools', 'Private repositories at home', 'Host Git repositories on this computer and push to them from anywhere on your network.'), iconUrl: null },
];

const servers: ServerRow[] = [
  {
    id: 'demo-1', owner_id: 'agent', name: 'Studio Mac mini', hostname: 'studio-mini.local', platform: 'darwin', arch: 'arm64', agent_version: '1.0.0',
    public_key: { kty: 'EC', crv: 'P-256', x: 'demo', y: 'demo' }, settings: { autoStartPlugins: true },
    started_at: iso(now - (3 * 86400 + 5 * 3600 + 17 * 60) * 1000), last_seen_at: iso(now), created_at: iso(now - 40 * 86400_000),
  },
  {
    id: 'demo-2', owner_id: 'agent', name: 'Basement Linux Box', hostname: 'basement', platform: 'linux', arch: 'x64', agent_version: '1.0.0',
    public_key: null, settings: {}, started_at: iso(now - 9 * 86400_000), last_seen_at: iso(now - 3 * 3600_000), created_at: iso(now - 90 * 86400_000),
  },
];

const byId = (id: string) => catalog.find((c) => c.manifest.id === id)!.manifest;

function row(serverId: string, m: PluginManifest, status: InstalledPluginRow['status']): InstalledPluginRow {
  return {
    server_id: serverId, plugin_id: m.id, name: m.name, version: m.version, source_url: catalog.find((c) => c.manifest.id === m.id)?.sourceUrl ?? null,
    manifest: m, settings: defaultSettings(m), status, status_detail: null, installed_at: iso(now - 5 * 86400_000), updated_at: iso(now),
    links: m.links?.map((l) => ({ label: l.label, url: l.url.replace('{{host}}', '192.168.1.24').replace('{{settings.port}}', '8080') })) ?? [],
  } as InstalledPluginRow;
}

export class DemoBackend implements Backend {
  demo = true;
  private push!: (p: Partial<BackendState>) => void;
  private selected = 'demo-1';
  private plugins: Record<string, InstalledPluginRow[]> = {
    'demo-1': [
      row('demo-1', byId('dev.easyserver.apache'), 'running'),
      row('demo-1', byId('dev.easyserver.minecraft'), 'running'),
      row('demo-1', byId('dev.easyserver.ollama'), 'stopped'),
      row('demo-1', byId('dev.example.python'), 'stopped'),
    ],
    'demo-2': [row('demo-2', byId('dev.example.jobs'), 'running')],
  };
  private files: Record<string, { path: string; size: number; modified: string }[]> = {
    'dev.easyserver.apache': [
      { path: 'index.html', size: 1420, modified: iso(now - 86400_000) },
      { path: 'about/index.html', size: 2210, modified: iso(now - 2 * 86400_000) },
      { path: 'css/site.css', size: 5120, modified: iso(now - 86400_000) },
      { path: 'img/hero.jpg', size: 284_311, modified: iso(now - 3 * 86400_000) },
    ],
  };
  private setupCb: ((s: SetupState) => void) | null = null;

  constructor(public mode: 'client' | 'server') {}

  async init(push: (p: Partial<BackendState>) => void) {
    this.push = push;
    push({
      account: { userId: 'demo-user', email: null, isAnonymous: true, mfa: null },
      servers: this.mode === 'server' ? [servers[0]] : servers,
    });
    await this.select('demo-1');
    setInterval(() => this.tick(), 3000);
  }

  private tick() {
    const s = servers.find((x) => x.id === this.selected)!;
    if (s.id === 'demo-1') s.last_seen_at = iso(Date.now());
    this.push({ status: this.status(s.id), servers: this.mode === 'server' ? [servers[0]] : [...servers] });
  }

  private status(id: string) {
    const t = Date.now() / 1000;
    return {
      server_id: id, cpu: 0.18 + 0.1 * Math.sin(t / 7), mem_used: 9.6e9 + 4e8 * Math.sin(t / 11), mem_total: 16e9,
      disk_used: 212e9, disk_total: 494e9, load_avg: 1.4, os_uptime: 12 * 86400 + 4000,
      os_name: id === 'demo-1' ? 'macOS 15.1' : 'Ubuntu 24.04 LTS', updated_at: iso(Date.now()),
    };
  }

  async select(id: string) {
    this.selected = id;
    this.push({
      selectedId: id,
      status: this.status(id),
      uptime: id === 'demo-1' ? [{ window_hours: 24, ratio: 1 }, { window_hours: 168, ratio: 0.996 }, { window_hours: 720, ratio: 0.981 }] : [{ window_hours: 24, ratio: 0.88 }, { window_hours: 168, ratio: 0.95 }, { window_hours: 720, ratio: 0.97 }],
      plugins: this.plugins[id] ?? [],
    });
  }

  private update(pluginId: string, patch: Partial<InstalledPluginRow>) {
    this.plugins[this.selected] = (this.plugins[this.selected] ?? []).map((p) => (p.plugin_id === pluginId ? { ...p, ...patch } : p));
    this.push({ plugins: [...this.plugins[this.selected]] });
  }

  async send<T extends CommandType>(type: T, payload: CommandMap[T]): Promise<any> {
    const p = payload as any;
    await new Promise((r) => setTimeout(r, 450));
    switch (type) {
      case 'plugin.install': {
        const item = catalog.find((c) => c.sourceUrl === p.sourceUrl)!;
        // Mimic the agent: report file-by-file progress, then requirements, then finish.
        const r = { ...row(this.selected, item.manifest, 'installing'), status_detail: 'Downloading files 0/8' };
        this.plugins[this.selected] = [...(this.plugins[this.selected] ?? []), r].sort((a, b) => a.name.localeCompare(b.name));
        const tickTo = async (detail: string, ms: number) => {
          await new Promise((res) => setTimeout(res, ms));
          this.update(item.manifest.id, { status_detail: detail });
        };
        for (let i = 1; i <= 8; i++) await tickTo(`Downloading files ${i}/8`, 260);
        await tickTo('Checking requirements', 500);
        await tickTo(`Installing ${item.manifest.name}`, 900);
        await new Promise((res) => setTimeout(res, 700));
        this.update(item.manifest.id, { status: 'stopped', status_detail: null });
        return { pluginId: item.manifest.id };
      }
      case 'plugin.uninstall':
        this.plugins[this.selected] = this.plugins[this.selected].filter((x) => x.plugin_id !== p.pluginId);
        this.push({ plugins: [...this.plugins[this.selected]] });
        return {};
      case 'plugin.start':
      case 'plugin.restart':
        this.update(p.pluginId, { status: 'running' });
        return {};
      case 'plugin.stop':
        this.update(p.pluginId, { status: 'stopped' });
        return {};
      case 'plugin.settings': {
        const pl = this.plugins[this.selected].find((x) => x.plugin_id === p.pluginId)!;
        const settings = sanitizeSettings(pl.manifest, { ...pl.settings, ...p.settings });
        this.update(p.pluginId, { settings });
        return { settings };
      }
      case 'plugin.action':
        return { code: 0, output: 'Syntax OK' };
      case 'plugin.logs':
        return {
          lines: Array.from({ length: 24 }, (_, i) =>
            p.logId === 'access'
              ? `192.168.1.${20 + (i % 7)} - - [${new Date(Date.now() - (24 - i) * 60000).toUTCString()}] "GET /${i % 3 ? '' : 'about/'} HTTP/1.1" 200 ${1400 + i * 13}`
              : `[${new Date(Date.now() - (24 - i) * 60000).toUTCString()}] [mpm_prefork:notice] Apache/2.4.62 configured -- resuming normal operations`,
          ),
        };
      case 'plugin.files.list':
        return { root: '/Users/demo/EasyServer/site', files: this.files[p.pluginId] ?? [] };
      case 'plugin.files.delete':
        this.files[p.pluginId] = (this.files[p.pluginId] ?? []).filter((f) => f.path !== p.path);
        return {};
      case 'server.rename': {
        const s = servers.find((x) => x.id === this.selected)!;
        s.name = p.name;
        this.push({ servers: this.mode === 'server' ? [servers[0]] : [...servers] });
        return { name: p.name };
      }
      case 'server.settings': {
        const s = servers.find((x) => x.id === this.selected)!;
        s.settings = { ...s.settings, ...p.settings };
        this.push({ servers: this.mode === 'server' ? [servers[0]] : [...servers] });
        return s.settings;
      }
      default:
        return {};
    }
  }

  async download(_pluginId: string, path: string) {
    await new Promise((r) => setTimeout(r, 400));
    return new TextEncoder().encode(`Demo download of ${path}\n`);
  }

  async upload(pluginId: string, files: LocalFile[], onProgress?: (d: number, t: number) => void, folder?: string) {
    for (let i = 0; i < files.length; i++) {
      await new Promise((r) => setTimeout(r, 120));
      onProgress?.(i + 1, files.length);
    }
    if (folder?.startsWith('setting.')) return;
    const list = (this.files[pluginId] ??= []);
    for (const f of files) {
      const i = list.findIndex((x) => x.path === f.path);
      const e = { path: f.path, size: f.data.length, modified: iso(Date.now()) };
      if (i >= 0) list[i] = e;
      else list.push(e);
    }
    list.sort((a, b) => a.path.localeCompare(b.path));
  }

  sources = async () => catalog.map((c) => c.sourceUrl);
  onSourcesChanged = () => () => {};
  installStats = async () => {
    const d = (n: number) => new Date(Date.now() - n * 86400_000).toISOString().slice(0, 10);
    return [
      { plugin_id: 'dev.easyserver.apache', day: d(0), installs: 14, uninstalls: 1 },
      { plugin_id: 'dev.example.python', day: d(1), installs: 9, uninstalls: 0 },
      { plugin_id: 'dev.example.files', day: d(0), installs: 6, uninstalls: 0 },
      { plugin_id: 'dev.example.git', day: d(4), installs: 12, uninstalls: 2 },
    ];
  };
  demoCatalog = () => catalog;

  claimCode = async (code: string) => {
    await new Promise((r) => setTimeout(r, 600));
    if (code !== 'ABCDEF') throw new Error('That code is not valid or has expired. (In the demo, use ABCDEF.)');
    const s: ServerRow = { ...servers[1], id: `demo-${servers.length + 1}`, name: 'New Server', last_seen_at: iso(Date.now()) };
    servers.push(s);
    this.plugins[s.id] = [];
    this.push({ servers: [...servers] });
    await this.select(s.id);
    return s.id;
  };
  leave = async (id: string) => {
    const i = servers.findIndex((s) => s.id === id);
    servers.splice(i, 1);
    this.push({ servers: [...servers] });
    if (servers[0]) await this.select(servers[0].id);
  };
  signUpWithEmail = async () => 'Check your inbox to confirm your email address.';
  signIn = async () => 'ok' as const;
  signOut = async () => {};
  enrollMfa = async () => ({ factorId: 'f', qr: '', secret: 'JBSWY3DPEHPK3PXP' });
  verifyMfa = async () => {};
  disableMfa = async () => {};

  setupState = async (): Promise<SetupState> => (new URLSearchParams(location.search).has('setup') ? { phase: 'name', suggested: 'Studio Mac mini' } : { phase: 'done' });
  onSetupChanged = (cb: (s: SetupState) => void) => {
    this.setupCb = cb;
    return () => (this.setupCb = null);
  };
  setup = async () => {
    this.setupCb?.({ phase: 'code', code: 'KXRMTW', expiresAt: iso(Date.now() + 15 * 60_000) });
    setTimeout(() => this.setupCb?.({ phase: 'done' }), 8000);
  };
  newPairingCode = async () => ({ code: 'QPLZHN', expiresAt: iso(Date.now() + 15 * 60_000) });
  members = async (): Promise<Member[]> => [{ user_id: '6f1c2a3b-0000-4000-8000-1b2c3d4e5f60', created_at: iso(now - 30 * 86400_000) }];
  revoke = async () => {};
  getOpenAtLogin = async () => true;
  setOpenAtLogin = async () => {};
  revealDataFolder = async () => '~/Library/Application Support/EasyServer/agent';
  resetServer = async () => {};
  keyFingerprint = async () => '3F2A 91C0 7B44 E1D8';
}

import { CATEGORIES, pluginFolders } from '@easyserver/core';
import type { CatalogItem } from './catalog';
import type { AppState, Detail, Tab } from './state';

export interface SearchResult {
  key: string;
  title: string;
  subtitle: string;
  group: 'Pages' | 'Your Plugins' | 'Plugin Store' | 'Settings' | 'Dashboard';
  tab: Tab;
  detail: Detail;
  target: string | null;
  iconUri?: string | null;
  iconId?: string;
  keywords: string;
}

const pages: SearchResult[] = [
  { key: 'p.home', title: 'Home', subtitle: 'Server dashboard', group: 'Pages', tab: 'home', detail: null, target: null, keywords: 'dashboard overview' },
  { key: 'p.discover', title: 'Discover', subtitle: 'Plugin store', group: 'Pages', tab: 'discover', detail: null, target: null, keywords: 'store browse get install' },
  { key: 'p.plugins', title: 'Plugins', subtitle: 'Installed plugins', group: 'Pages', tab: 'plugins', detail: null, target: null, keywords: 'installed manage' },
  { key: 'p.settings', title: 'Settings', subtitle: 'App and server settings', group: 'Pages', tab: 'settings', detail: null, target: null, keywords: 'preferences options' },
];

const dashboard: [string, string, string][] = [
  ['home.runtime', 'Run Time', 'how long the server has been running uptime started'],
  ['home.uprate', 'Up Rate', 'availability uptime percent 24 hours 7 days 30 days'],
  ['home.plugins', 'Plugins Running', 'count'],
  ['home.cpu', 'Processor Usage', 'cpu load'],
  ['home.memory', 'Memory Usage', 'ram'],
  ['home.disk', 'Disk Usage', 'storage space'],
  ['home.running', 'Running Plugins', 'active'],
  ['home.system', 'System Information', 'os operating system architecture hostname version'],
];

const clientSettings: [string, string, string][] = [
  ['settings.account', 'Account', 'email sign in sign out guest'],
  ['settings.2fa', 'Two-Factor Authentication', '2fa mfa totp authenticator security code'],
  ['settings.server', 'Server Name', 'rename current server'],
  ['settings.autostart', 'Start Plugins Automatically', 'boot launch autostart'],
  ['settings.encryption', 'Encryption Key', 'fingerprint security end-to-end'],
  ['settings.remove', 'Remove Server from This Device', 'unpair forget leave delete'],
  ['settings.store', 'Plugin Store Cache', 'clear cache refresh'],
  ['settings.about', 'About EasyServer', 'version'],
];

const serverSettings: [string, string, string][] = [
  ['settings.server', 'Server Name', 'rename this server'],
  ['settings.clients', 'Paired Clients', 'devices pair code revoke add client'],
  ['settings.startup', 'Open at Login', 'startup launch boot'],
  ['settings.autostart', 'Start Plugins Automatically', 'boot launch autostart'],
  ['settings.encryption', 'Encryption Key', 'fingerprint security end-to-end'],
  ['settings.data', 'Data Folder', 'files location disk'],
  ['settings.cli', 'Command-Line Tool', 'terminal cli headless service'],
  ['settings.store', 'Plugin Store Cache', 'clear cache refresh'],
  ['settings.reset', 'Reset Server', 'delete remove forget'],
  ['settings.about', 'About EasyServer', 'version'],
];

export function buildIndex(s: AppState, catalog: CatalogItem[], mode: 'client' | 'server', iconFor: (p: any) => string | null): SearchResult[] {
  const out: SearchResult[] = [...pages];
  for (const [id, title, kw] of dashboard) out.push({ key: id, title, subtitle: 'Home', group: 'Dashboard', tab: 'home', detail: null, target: id, keywords: kw });
  for (const [id, title, kw] of mode === 'client' ? clientSettings : serverSettings)
    out.push({ key: id, title, subtitle: 'Settings', group: 'Settings', tab: 'settings', detail: null, target: id, keywords: kw });

  for (const p of s.plugins) {
    const d: Detail = { kind: 'plugin', pluginId: p.plugin_id };
    const icon = { iconUri: iconFor(p), iconId: p.plugin_id };
    out.push({ key: `ip.${p.plugin_id}`, title: p.name, subtitle: `Installed · ${p.status}`, group: 'Your Plugins', tab: 'plugins', detail: d, target: null, keywords: `${p.manifest.description} ${p.manifest.developer}`, ...icon });
    const sec = (id: string, title: string, kw = '') =>
      out.push({ key: `ip.${p.plugin_id}.${id}`, title: `${p.name} › ${title}`, subtitle: 'Plugin', group: 'Your Plugins', tab: 'plugins', detail: d, target: `plugin.${p.plugin_id}.${id}`, keywords: kw, ...icon });
    if (p.manifest.settings?.length) sec('settings', 'Settings');
    for (const f of p.manifest.settings ?? []) sec(`setting.${f.key}`, f.label, `${f.description ?? ''} ${f.group ?? ''} setting`);
    pluginFolders(p.manifest).forEach((f, i) => sec(i === 0 ? 'files' : `files.${f.id}`, f.label, 'upload download files transfer'));
    if (p.manifest.actions?.length) sec('actions', 'Actions', p.manifest.actions.map((a) => a.label).join(' '));
    sec('logs', 'Logs', (p.manifest.logs ?? []).map((l) => l.label).join(' ') + ' output errors');
    sec('remove', 'Remove Plugin', 'uninstall delete');
  }

  for (const it of catalog) {
    out.push({
      key: `st.${it.id}`,
      title: it.name,
      subtitle: `Plugin Store · ${CATEGORIES[it.manifest.category]}`,
      group: 'Plugin Store',
      tab: 'discover',
      detail: { kind: 'store', sourceUrl: it.sourceUrl },
      target: null,
      keywords: `${it.manifest.subtitle ?? ''} ${it.manifest.developer} ${it.manifest.description}`,
      iconUri: it.iconUrl,
      iconId: it.id,
    });
  }
  return out;
}

/** Title prefix > word prefix > title substring > keyword substring. */
export function search(index: SearchResult[], q: string): SearchResult[] {
  const query = q.trim().toLowerCase();
  if (!query) return [];
  const terms = query.split(/\s+/);
  const scored: [number, SearchResult][] = [];
  for (const r of index) {
    const title = r.title.toLowerCase();
    const hay = `${title} ${r.subtitle.toLowerCase()} ${r.keywords.toLowerCase()}`;
    if (!terms.every((t) => hay.includes(t))) continue;
    let score = 0;
    if (title.startsWith(query)) score += 100;
    else if (title.split(/[\s›]+/).some((w) => w.startsWith(terms[0]))) score += 60;
    else if (title.includes(query)) score += 40;
    else score += 10;
    if (r.group === 'Pages') score += 15;
    score -= r.title.length / 100;
    scored.push([score, r]);
  }
  return scored.sort((a, b) => b[0] - a[0]).slice(0, 60).map((x) => x[1]);
}

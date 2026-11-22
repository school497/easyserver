/**
 * EasyServer plugin manifest — `easyserver.plugin.json`.
 *
 * A plugin is a folder (usually a GitHub repo or a sub-folder of one) holding this JSON file
 * plus the files it lists. The agent downloads exactly the files listed in `files`, nothing else.
 * Everything the app shows and every way it manages the plugin comes from this manifest.
 * See PLUGINS.md for the full guide.
 */

export type Platform = 'darwin' | 'linux' | 'win32';
export const PLATFORMS: Platform[] = ['darwin', 'linux', 'win32'];

export const CATEGORIES = {
  'web-servers': 'Web Servers',
  computing: 'Computing',
  storage: 'Storage',
  networking: 'Networking',
  'developer-tools': 'Developer Tools',
  media: 'Media',
  games: 'Games',
  other: 'Other',
} as const;
export type Category = keyof typeof CATEGORIES;

export interface BinaryCandidate {
  /**
   * Absolute path; may use template variables ({{env.APPDATA}}, {{dataDir}}, {{home}}).
   * `*` matches within one path segment (newest match wins); "@path:name" searches PATH.
   */
  path: string;
  /** Extra template variables exposed as {{req.<id>.<name>}} when this candidate is picked. */
  vars?: Record<string, string>;
}

export interface Requirement {
  /** Referenced in templates as {{bin.<id>}} (the resolved path) and {{req.<id>.<var>}}. */
  id: string;
  label: string;
  candidates: Partial<Record<Platform, BinaryCandidate[]>>;
  /**
   * Steps run in order when no candidate exists: a shell string (sh -c, or PowerShell on Windows),
   * or { command, args } run directly. command "@node" runs a script shipped with the plugin.
   */
  install?: Partial<Record<Platform, (string | CommandStep)[]>>;
  /** Shown when the binary can't be found or installed. */
  hint?: string;
}

export const SETTING_TYPES = [
  'string', // single-line text
  'text', // multi-line text (rows)
  'password', // secret, masked in the app
  'number', // any number (min, max, step, unit)
  'port', // 1-65535 integer
  'slider', // number picked on a track (min, max, step, unit)
  'boolean', // on/off switch
  'select', // one of options (segmented control)
  'multiselect', // any of options (chips) -> string[]
  'list', // list of strings, add/remove rows -> string[]
  'email',
  'url',
  'path', // a path on the server
  'color', // #RRGGBB
  'file', // a file people upload from the app; value = file name, path = {{files.<key>}}
] as const;
export type SettingType = (typeof SETTING_TYPES)[number];

export interface SettingField {
  key: string;
  label: string;
  type: SettingType;
  default: string | number | boolean | string[];
  description?: string;
  placeholder?: string;
  /** Section heading this field (and the ones after it) sits under. */
  group?: string;
  options?: { label: string; value: string }[];
  min?: number;
  max?: number;
  step?: number;
  /** Shown after numbers, e.g. "MB" or "seconds". */
  unit?: string;
  /** text: visible lines (default 4). */
  rows?: number;
  /** string, text, password, list items: must match this regular expression. */
  pattern?: string;
  /** Message shown when pattern doesn't match. */
  patternHint?: string;
  required?: boolean;
  /** list/multiselect: maximum number of items. */
  maxItems?: number;
  /** file: allowed extensions, e.g. [".pem", ".crt"]. */
  accept?: string[];
  /** file: maximum size in MB (default 10). */
  maxFileMB?: number;
  /** Only show this field when another setting has a given value. */
  visibleIf?: { key: string; equals: string | number | boolean };
  /** Restart the plugin automatically after this setting changes (default true). */
  restart?: boolean;
}

/** A folder on the server that people browse, upload into and download from in the app. */
export interface FolderSpec {
  id: string;
  label: string;
  /** Must resolve inside the plugin's folders, e.g. "{{dataDir}}/site". */
  root: string;
  description?: string;
  accept?: string[];
  maxFileMB?: number;
  /** Set false to hide downloads for this folder (default true). */
  download?: boolean;
}

/** A command run directly (never through a shell). "@node" runs a plugin .mjs script with EasyServer's own runtime. */
export interface CommandStep {
  command: string;
  /** Arguments that render to an empty string are dropped, so `{{#if …}}` can toggle flags. */
  args?: string[];
  env?: Record<string, string>;
}

export interface RunSpec extends CommandStep {
  /** Working directory, inside the plugin's folders (default {{runtimeDir}}). */
  cwd?: string;
  /** Run before the process is signalled, for a graceful shutdown (e.g. `docker compose down`). */
  stop?: CommandStep & { timeoutSec?: number };
}

export interface PluginAction {
  id: string;
  label: string;
  description?: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
  /** Only offer this action on these platforms. */
  platforms?: Platform[];
  /** Run as a job: the button returns at once and output streams to Logs › Actions. */
  background?: boolean;
  /** Time limit (default 120 s, max 600 s; background jobs default to 6 hours). */
  timeoutSec?: number;
  /** If set, the app asks for confirmation with this text first. */
  confirm?: string;
  destructive?: boolean;
}

export interface PluginManifest {
  schema: 1;
  id: string;
  name: string;
  version: string;
  developer: string;
  subtitle?: string;
  description: string;
  category: Category;
  icon: string;
  platforms: Platform[];
  files: string[];
  requires?: Requirement[];
  settings?: SettingField[];
  /** Rendered before every start into {{runtimeDir}} (or {{dataDir}} with "into": "data"). */
  templates?: { src: string; dest: string; into?: 'runtime' | 'data' }[];
  /** Copied into {{dataDir}} once, only if the destination doesn't exist yet. */
  seed?: { src: string; dest: string }[];
  run: RunSpec;
  /** Per-platform replacement for `run`. */
  platformRun?: Partial<Record<Platform, RunSpec>>;
  health?: { type: 'http' | 'tcp'; target: string; intervalSec?: number };
  logs?: { id: string; label: string; path: string }[];
  links?: { label: string; url: string }[];
  actions?: PluginAction[];
  /**
   * Folders people manage from the app with end-to-end encrypted upload and download.
   * Every plugin gets file transfer: if none are declared, one "Files" folder at {{dataDir}}/files is provided.
   */
  folders?: FolderSpec[];
  /** @deprecated single-folder form of `folders`; still accepted. */
  content?: { label: string; root: string; accept?: string[]; maxFileMB?: number };
}

export const DEFAULT_FOLDER: FolderSpec = {
  id: 'files',
  label: 'Files',
  root: '{{dataDir}}/files',
  description: 'Files this plugin can use. Its commands and templates find them at {{dataDir}}/files.',
};

/** The folders a plugin exposes (declared, legacy `content`, or the default one). */
export function pluginFolders(m: PluginManifest): FolderSpec[] {
  if (m.folders?.length) return m.folders;
  if (m.content) return [{ id: 'content', ...m.content }];
  return [DEFAULT_FOLDER];
}

/** Hidden per-setting folder that holds a `file` setting's upload. */
export const settingFolderId = (key: string) => `setting.${key}`;

const ID_RE = /^[a-z0-9]+(\.[a-z0-9-]+)+$/;
const KEY_RE = /^[a-zA-Z][a-zA-Z0-9_]*$/;
const SAFE_REL = (p: string) => !!p && !p.startsWith('/') && !p.includes('..') && !/^[a-zA-Z]:/.test(p) && !p.includes('\\');

export function validateManifest(m: any): { ok: true; manifest: PluginManifest } | { ok: false; errors: string[] } {
  const e: string[] = [];
  const str = (v: any, f: string) => (typeof v === 'string' && v.trim() ? true : (e.push(`${f} must be a non-empty string`), false));
  if (!m || typeof m !== 'object') return { ok: false, errors: ['manifest is not an object'] };
  if (m.schema !== 1) e.push('schema must be 1');
  if (str(m.id, 'id') && !ID_RE.test(m.id)) e.push('id must be reverse-DNS, e.g. dev.example.myplugin');
  str(m.name, 'name');
  if (str(m.version, 'version') && !/^\d+\.\d+\.\d+/.test(m.version)) e.push('version must be semver');
  str(m.developer, 'developer');
  str(m.description, 'description');
  if (!(m.category in CATEGORIES)) e.push(`category must be one of ${Object.keys(CATEGORIES).join(', ')}`);
  if (str(m.icon, 'icon') && !SAFE_REL(m.icon)) e.push('icon must be a relative path');
  if (!Array.isArray(m.platforms) || !m.platforms.length || m.platforms.some((p: any) => !PLATFORMS.includes(p)))
    e.push('platforms must list darwin, linux and/or win32');
  if (!Array.isArray(m.files) || m.files.some((f: any) => typeof f !== 'string' || !SAFE_REL(f)))
    e.push('files must be relative paths without ".."');
  else if (m.icon && !m.files.includes(m.icon)) e.push('files must include the icon');
  if (!m.run || typeof m.run.command !== 'string') e.push('run.command is required');
  for (const r of m.requires ?? []) {
    if (!KEY_RE.test(r.id ?? '')) e.push(`requires.id "${r.id}" is invalid`);
    if (!r.candidates || typeof r.candidates !== 'object') e.push(`requires.${r.id}.candidates is required`);
  }
  for (const s of m.settings ?? []) {
    if (!KEY_RE.test(s.key ?? '')) e.push(`settings.key "${s.key}" is invalid`);
    if (!SETTING_TYPES.includes(s.type)) e.push(`settings.${s.key}.type must be one of ${SETTING_TYPES.join(', ')}`);
    if ((s.type === 'select' || s.type === 'multiselect') && !Array.isArray(s.options)) e.push(`settings.${s.key}.options is required for ${s.type}`);
    if (s.type === 'slider' && (typeof s.min !== 'number' || typeof s.max !== 'number')) e.push(`settings.${s.key} slider needs min and max`);
    if (s.pattern) {
      try {
        new RegExp(s.pattern);
      } catch {
        e.push(`settings.${s.key}.pattern is not a valid regular expression`);
      }
    }
    if (s.visibleIf && !(m.settings ?? []).some((o: any) => o.key === s.visibleIf.key)) e.push(`settings.${s.key}.visibleIf refers to unknown key ${s.visibleIf.key}`);
  }
  const keys = (m.settings ?? []).map((s: any) => s.key);
  if (new Set(keys).size !== keys.length) e.push('settings keys must be unique');
  for (const f of m.folders ?? []) {
    if (!KEY_RE.test((f.id ?? '').replace(/-/g, '_'))) e.push(`folders.id "${f.id}" is invalid`);
    if (typeof f.root !== 'string' || !/^\{\{(dataDir|runtimeDir|logsDir)\}\}/.test(f.root)) e.push(`folders.${f.id}.root must start with {{dataDir}}, {{runtimeDir}} or {{logsDir}}`);
  }
  for (const t of [...(m.templates ?? []), ...(m.seed ?? [])]) {
    if (!SAFE_REL(t.src) || !SAFE_REL(t.dest)) e.push(`template/seed paths must be relative: ${t.src} -> ${t.dest}`);
    else if (!m.files?.includes(t.src)) e.push(`files must include ${t.src}`);
  }
  for (const a of m.actions ?? []) if (!KEY_RE.test((a.id ?? '').replace(/-/g, '_'))) e.push(`actions.id "${a.id}" is invalid`);
  return e.length ? { ok: false, errors: e } : { ok: true, manifest: m as PluginManifest };
}

export function defaultSettings(m: PluginManifest): Record<string, any> {
  const out: Record<string, any> = {};
  for (const s of m.settings ?? []) out[s.key] = s.default;
  return out;
}

export const isSettingVisible = (f: SettingField, values: Record<string, any>) => !f.visibleIf || values[f.visibleIf.key] === f.visibleIf.equals;

/** Coerce and validate a settings object against the manifest. Unknown keys are dropped. */
export function sanitizeSettings(m: PluginManifest, input: Record<string, any>): Record<string, any> {
  const out = defaultSettings(m);
  const fields = m.settings ?? [];
  for (const s of fields) if (s.key in input) out[s.key] = input[s.key];
  for (const s of fields) {
    let v = out[s.key];
    const fail = (msg: string): never => {
      throw new Error(`${s.label} ${msg}`);
    };
    const checkPattern = (x: string) => {
      if (s.pattern && x && !new RegExp(s.pattern).test(x)) fail(s.patternHint ?? "doesn't match the required format");
    };
    switch (s.type) {
      case 'boolean':
        v = v === true || v === 'true';
        break;
      case 'number':
      case 'port':
      case 'slider': {
        v = Number(v);
        if (!Number.isFinite(v)) fail('must be a number');
        const min = s.min ?? (s.type === 'port' ? 1 : -Infinity);
        const max = s.max ?? (s.type === 'port' ? 65535 : Infinity);
        if (v < min || v > max) fail(`must be between ${min} and ${max}`);
        if (s.type === 'port') v = Math.round(v);
        if (s.step) v = Number((Math.round(v / s.step) * s.step).toFixed(6));
        break;
      }
      case 'select':
        if (!s.options?.some((o) => o.value === v)) fail('has an invalid choice');
        break;
      case 'multiselect':
      case 'list': {
        if (typeof v === 'string') v = v ? v.split(/\r?\n/) : [];
        if (!Array.isArray(v)) fail('must be a list');
        v = (v as any[]).map((x) => String(x).trim()).filter(Boolean);
        if (s.maxItems && v.length > s.maxItems) fail(`can have at most ${s.maxItems} items`);
        for (const x of v) {
          if (/[\r\n]/.test(x)) fail("items can't contain line breaks");
          if (s.type === 'multiselect' && !s.options?.some((o) => o.value === x)) fail('has an invalid choice');
          if (s.type === 'list') checkPattern(x);
        }
        break;
      }
      case 'color':
        v = String(v ?? '').trim();
        if (!/^#[0-9a-fA-F]{6}$/.test(v)) fail('must be a color like #3366FF');
        break;
      case 'email':
        v = String(v ?? '').trim();
        if (v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) fail('must be an email address');
        break;
      case 'url':
        v = String(v ?? '').trim();
        if (v && !/^https?:\/\/\S+$/.test(v)) fail('must start with http:// or https://');
        break;
      case 'file':
        v = String(v ?? '');
        if (v && (v.includes('/') || v.includes('\\') || v.startsWith('.'))) fail('is not a valid file name');
        break;
      case 'text':
        v = String(v ?? '');
        if (v.length > 64_000) fail('is too long');
        checkPattern(v);
        break;
      default: // string, password, path
        v = String(v ?? '');
        if (/[\r\n]/.test(v)) fail("can't contain line breaks");
        checkPattern(v);
    }
    out[s.key] = v;
  }
  for (const s of fields) {
    const empty = out[s.key] === '' || (Array.isArray(out[s.key]) && !out[s.key].length);
    if (s.required && empty && isSettingVisible(s, out)) throw new Error(`${s.label} is required`);
  }
  return out;
}

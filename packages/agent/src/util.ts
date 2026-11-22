import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** Where the agent keeps its identity, keys, sessions and plugins. Shared by the CLI and the desktop server app. */
export function homeDir(): string {
  if (process.env.EASYSERVER_HOME) return process.env.EASYSERVER_HOME;
  switch (process.platform) {
    case 'win32':
      return path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'EasyServer', 'agent');
    case 'darwin':
      return path.join(os.homedir(), 'Library', 'Application Support', 'EasyServer', 'agent');
    default:
      return path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), 'easyserver', 'agent');
  }
}

export function ensureDir(dir: string, mode = 0o700) {
  fs.mkdirSync(dir, { recursive: true, mode });
  return dir;
}

export function readJson<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
  } catch {
    return fallback;
  }
}

/** Atomic write, readable only by the current user. */
export function writeJson(file: string, value: unknown) {
  ensureDir(path.dirname(file));
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, file);
}

/** Resolve `rel` inside `root`, refusing anything that escapes it. */
export function safeJoin(root: string, rel: string): string {
  const clean = rel.replace(/\\/g, '/').replace(/^\/+/, '');
  if (!clean || clean.split('/').some((s) => s === '..' || s === '')) throw new Error(`Invalid path: ${rel}`);
  const full = path.resolve(root, clean);
  const base = path.resolve(root);
  if (full !== base && !full.startsWith(base + path.sep)) throw new Error(`Path escapes its folder: ${rel}`);
  return full;
}

export function tailFile(file: string, lines: number, maxBytes = 256 * 1024): string[] {
  if (!fs.existsSync(file)) return [];
  const { size } = fs.statSync(file);
  const start = Math.max(0, size - maxBytes);
  const fd = fs.openSync(file, 'r');
  try {
    const buf = Buffer.alloc(size - start);
    fs.readSync(fd, buf, 0, buf.length, start);
    const all = buf.toString('utf8').split(/\r?\n/);
    if (start > 0) all.shift();
    if (all.length && all[all.length - 1] === '') all.pop();
    return all.slice(-lines);
  } finally {
    fs.closeSync(fd);
  }
}

/**
 * Tiny template language used by plugin manifests and template files:
 *   {{a.b.c}}                       value lookup (missing -> empty string, lists -> comma-joined)
 *   {{a.b|json}} {{a|lines}} {{a|space}} {{a|quote}}   filters
 *   {{#if flag}} ... {{/if}}        kept when flag is truthy (empty lists are falsy)
 *   {{#if key=value}} ... {{/if}}   kept when String(key) === value
 *   {{#unless flag}} ... {{/unless}}
 *   {{#each list}} ... {{this}} ... {{/each}}   repeated per item
 * Blocks can nest. No code execution.
 */
export function render(tpl: string, ctx: Record<string, any>): string {
  const get = (c: Record<string, any>, key: string) => key.split('.').reduce<any>((o, k) => (o == null ? undefined : o[k]), c);
  const truthy = (v: any) => (Array.isArray(v) ? v.length > 0 : !!v);
  const each = /\{\{#each\s+([\w.]+)\}\}((?:(?!\{\{#each\s)[\s\S])*?)\{\{\/each\}\}/;
  const block = /\{\{#(if|unless)\s+([\w.]+)(?:=([\w.:-]+))?\}\}((?:(?!\{\{#(?:if|unless)\s)[\s\S])*?)\{\{\/\1\}\}/;
  const values = (text: string, c: Record<string, any>) =>
    text.replace(/\{\{\s*([\w.]+)\s*(?:\|\s*(\w+))?\s*\}\}/g, (_, k, f) => {
      const v = get(c, k);
      if (f === 'json') return JSON.stringify(v ?? null);
      const list = Array.isArray(v) ? v.map(String) : v == null || v === '' ? [] : [String(v)];
      if (f === 'lines') return list.join('\n');
      if (f === 'space') return list.join(' ');
      if (f === 'quote') return list.map((x) => `"${x.replace(/(["\\])/g, '\\$1')}"`).join(' ');
      return v == null ? '' : Array.isArray(v) ? v.join(',') : String(v);
    });
  const pass = (text: string, c: Record<string, any>): string => {
    let out = text;
    for (let guard = 0; guard < 1000; guard++) {
      const m = out.match(each);
      if (!m) break;
      const list = get(c, m[1]);
      const body = (Array.isArray(list) ? list : []).map((item) => pass(m[2], { ...c, this: item })).join('');
      out = out.slice(0, m.index!) + body + out.slice(m.index! + m[0].length);
    }
    for (let guard = 0; guard < 1000; guard++) {
      const m = out.match(block);
      if (!m) break;
      const v = get(c, m[2]);
      const yes = m[3] !== undefined ? String(v) === m[3] : truthy(v);
      const keep = m[1] === 'if' ? yes : !yes;
      out = out.slice(0, m.index!) + (keep ? m[4] : '') + out.slice(m.index! + m[0].length);
    }
    return values(out, c);
  };
  return pass(tpl, ctx);
}

export type Logger = (level: 'info' | 'warn' | 'error', msg: string) => void;
export const consoleLogger: Logger = (level, msg) => {
  const t = new Date().toISOString().slice(11, 19);
  (level === 'error' ? console.error : console.log)(`[${t}] ${level === 'info' ? '' : level.toUpperCase() + ' '}${msg}`);
};

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function errMsg(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === 'object' && 'message' in e) return String((e as any).message);
  return String(e);
}

import fs from 'node:fs';
import path from 'node:path';
import { render } from './util';

/**
 * `"command": "@node"` in a manifest runs a plugin's JavaScript (.mjs) with the runtime EasyServer
 * itself is running on, so plugin scripts work on every server without Node being installed:
 *   desktop server app -> Electron in Node mode, CLI binary -> its embedded Bun, dev -> node.
 */
export function nodeRuntime(): { command: string; prefix: string[]; env: Record<string, string> } {
  const exe = process.execPath;
  if (process.versions.electron) return { command: exe, prefix: [], env: { ELECTRON_RUN_AS_NODE: '1' } };
  const base = path.basename(exe).toLowerCase();
  if ((process.versions as any).bun && !/^bun(\.exe)?$/.test(base)) return { command: exe, prefix: ['__run-script'], env: {} };
  return { command: exe, prefix: [], env: {} };
}

export interface CommandSpec {
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

/** Renders a command spec. Arguments that render to an empty string are dropped. */
export function buildCommand(spec: CommandSpec, ctx: Record<string, any>, extraEnv: Record<string, string> = {}) {
  let command = render(spec.command, ctx);
  let args = (spec.args ?? []).map((a) => render(a, ctx)).filter((a) => a !== '');
  const env: Record<string, string> = { ...(process.env as any), ...extraEnv };
  for (const [k, v] of Object.entries(spec.env ?? {})) {
    const val = render(v, ctx);
    if (val !== '') env[k] = val;
  }
  if (command === '@node') {
    const rt = nodeRuntime();
    command = rt.command;
    args = [...rt.prefix, ...args];
    Object.assign(env, rt.env);
  }
  return { command, args, env };
}

/** Environment every plugin process, action and script receives. */
export function scriptEnv(ctx: Record<string, any>): Record<string, string> {
  return {
    ES_PLUGIN_DIR: ctx.pluginDir,
    ES_DATA_DIR: ctx.dataDir,
    ES_RUNTIME_DIR: ctx.runtimeDir,
    ES_LOGS_DIR: ctx.logsDir,
    ES_SETTINGS: JSON.stringify(ctx.settings ?? {}),
    ES_FILES: JSON.stringify(ctx.files ?? {}),
    ES_BIN: JSON.stringify(ctx.bin ?? {}),
    ES_HOST: String(ctx.host ?? ''),
  };
}

function which(name: string): string | null {
  const exts = process.platform === 'win32' ? (process.env.PATHEXT ?? '.EXE;.CMD;.BAT').split(';').map((e) => e.toLowerCase()) : [''];
  for (const dir of (process.env.PATH ?? '').split(path.delimiter)) {
    if (!dir) continue;
    for (const ext of ['', ...exts]) {
      const p = path.join(dir, name + ext);
      try {
        if (fs.statSync(p).isFile()) return p;
      } catch {}
    }
  }
  return null;
}

/**
 * Resolves a requirement candidate path:
 *   "@path:java"                         first `java` on PATH
 *   "C:/Program Files/Java/jdk-*\/bin/java.exe"   `*` matches within one path segment; the
 *                                         highest match wins (so the newest version is picked)
 */
export function resolveCandidate(pattern: string, ctx: Record<string, any>): string | null {
  const rendered = render(pattern, ctx).replace(/\\/g, '/');
  if (!rendered) return null;
  if (rendered.startsWith('@path:')) return which(rendered.slice(6))?.replace(/\\/g, '/') ?? null;
  if (!rendered.includes('*')) return fs.existsSync(rendered) ? rendered : null;
  const parts = rendered.split('/');
  let bases = [parts[0] === '' ? '/' : parts[0] + '/'];
  for (let i = 1; i < parts.length; i++) {
    const seg = parts[i];
    if (!seg) continue;
    const next: string[] = [];
    for (const b of bases) {
      if (!seg.includes('*')) {
        const p = path.posix.join(b, seg);
        if (fs.existsSync(p)) next.push(p);
        continue;
      }
      const re = new RegExp('^' + seg.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$', 'i');
      let names: string[] = [];
      try {
        names = fs.readdirSync(b);
      } catch {}
      for (const n of names) if (re.test(n)) next.push(path.posix.join(b, n));
    }
    bases = next.sort((a, z) => z.localeCompare(a, undefined, { numeric: true }));
    if (!bases.length) return null;
  }
  return bases[0] ?? null;
}

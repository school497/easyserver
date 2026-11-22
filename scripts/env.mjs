// Reads the repo-root .env and returns bundler `define` values.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function loadEnv() {
  const out = { ...process.env };
  const file = path.join(root, '.env');
  if (fs.existsSync(file)) {
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !line.trim().startsWith('#')) out[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
    }
  }
  return out;
}

export function defines() {
  const e = loadEnv();
  return {
    __SUPABASE_URL__: JSON.stringify(e.SUPABASE_URL || ''),
    __SUPABASE_KEY__: JSON.stringify(e.SUPABASE_ANON_KEY || ''),
  };
}

// Sets the release version everywhere it lives: node scripts/set-version.mjs 1.2.0
import fs from 'node:fs';
import path from 'node:path';
import { root } from './env.mjs';

const v = (process.argv[2] || '').replace(/^v/, '');
if (!/^\d+\.\d+\.\d+$/.test(v)) throw new Error('usage: set-version.mjs <major.minor.patch>');
for (const f of ['package.json', 'apps/client/package.json', 'apps/server/package.json']) {
  const p = path.join(root, f);
  const j = JSON.parse(fs.readFileSync(p, 'utf8'));
  j.version = v;
  fs.writeFileSync(p, JSON.stringify(j, null, 2) + '\n');
}
console.log(`Version set to ${v}`);

import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { root } from '../env.mjs';

const out = path.join(root, 'node_modules', '.cache', 'selftest.cjs');
await build({ entryPoints: [path.join(root, 'scripts/test/selftest.ts')], bundle: true, platform: 'node', format: 'cjs', outfile: out, logLevel: 'error', external: ['ws'] });
execFileSync(process.execPath, [out], { stdio: 'inherit', cwd: root });

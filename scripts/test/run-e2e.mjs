import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { defines, root } from '../env.mjs';

const out = path.join(root, 'node_modules', '.cache', 'e2e.cjs');
await build({
  entryPoints: [path.join(root, 'scripts/test/e2e.ts')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  outfile: out,
  logLevel: 'error',
  define: defines(),
});
execFileSync(process.execPath, [out], { stdio: 'inherit', cwd: root });

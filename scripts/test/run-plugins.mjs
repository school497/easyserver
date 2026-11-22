import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { root } from '../env.mjs';

const out = path.join(root, 'node_modules', '.cache', 'plugins-test.mjs');
await build({
  entryPoints: [path.join(root, 'scripts/test/plugins.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: out,
  logLevel: 'error',
  external: ['ws'],
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
});
execFileSync(process.execPath, [out], { stdio: 'inherit', cwd: root });

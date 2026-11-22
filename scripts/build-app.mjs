// Builds one desktop app: the React Native (web) renderer with Vite, and the Electron main/preload with esbuild.
import path from 'node:path';
import { build as viteBuild } from 'vite';
import { build as esbuild } from 'esbuild';
import { defines, root } from './env.mjs';

const app = process.argv[2];
if (!['client', 'server'].includes(app)) throw new Error('usage: build-app.mjs <client|server>');
const dir = path.join(root, 'apps', app);
process.chdir(dir);

export async function buildMain(extraDefine = {}) {
  await esbuild({
    absWorkingDir: dir,
    entryPoints: { main: 'electron/main.ts', preload: 'electron/preload.ts' },
    outdir: 'dist-electron',
    outExtension: { '.js': '.cjs' },
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node20',
    external: ['electron', 'bufferutil', 'utf-8-validate'],
    define: { ...defines(), ...extraDefine },
    sourcemap: false,
    logLevel: 'info',
  });
}

if (process.argv[3] === '--main-only') {
  await buildMain();
} else {
  await viteBuild({ configFile: path.join(root, 'scripts', 'vite.config.mjs'), mode: 'production' });
  // Production builds can never be pointed at another URL.
  await buildMain({ 'process.env.VITE_DEV_URL': 'undefined' });
}

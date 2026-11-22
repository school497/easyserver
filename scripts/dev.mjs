// Runs Vite + Electron for one app with live reload of the renderer.
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createServer } from 'vite';
import { createRequire } from 'node:module';
import { root } from './env.mjs';

const app = process.argv[2];
const dir = path.join(root, 'apps', app);
process.chdir(dir);
const port = app === 'client' ? 5173 : 5174;
process.env.PORT = String(port);
const server = await createServer({ configFile: path.join(root, 'scripts', 'vite.config.mjs') });
await server.listen();
const build = spawn(process.execPath, [path.join(root, 'scripts', 'build-app.mjs'), app, '--main-only'], { stdio: 'inherit' });
await new Promise((r) => build.on('exit', r));
const electron = createRequire(import.meta.url)('electron');
const child = spawn(electron, ['.'], { stdio: 'inherit', env: { ...process.env, VITE_DEV_URL: `http://localhost:${port}` } });
child.on('exit', () => server.close().then(() => process.exit(0)));

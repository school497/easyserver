// Builds and packages a desktop app: node scripts/package.mjs <client|server> [--win|--mac|--linux]
// On Windows, NSIS can't read files past MAX_PATH, so packaging runs from a short staging folder
// (EASYSERVER_STAGE, default %TEMP%\esb) when the repo lives in a deep path.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { root } from './env.mjs';

const [app, ...flags] = process.argv.slice(2);
if (!['client', 'server'].includes(app)) throw new Error('usage: package.mjs <client|server> [--win|--mac|--linux]');
const appDir = path.join(root, 'apps', app);
const run = (cmd, args, cwd) => {
  // .cmd shims need a shell on Windows; quote everything so paths with spaces survive.
  const win = process.platform === 'win32' && !cmd.endsWith('.exe');
  const q = (s) => (win && /[\s"]/.test(s) ? `"${s.replace(/"/g, '\\"')}"` : s);
  execFileSync(win ? q(cmd) : cmd, win ? args.map(q) : args, { stdio: 'inherit', cwd, shell: win });
};

run(process.execPath, [path.join(root, 'scripts', 'build-app.mjs'), app], root);

const deep = process.platform === 'win32' && root.length > 80;
let cwd = appDir;
if (deep) {
  const stage = process.env.EASYSERVER_STAGE || path.join(os.tmpdir(), 'esb');
  fs.mkdirSync(stage, { recursive: true });
  if (!fs.existsSync(path.join(stage, 'node_modules', 'electron-builder'))) {
    fs.writeFileSync(path.join(stage, 'package.json'), '{"name":"esb","private":true}');
    run('npm', ['i', 'electron-builder@25.1.8', '--no-audit', '--no-fund'], stage);
  }
  cwd = path.join(stage, app);
  fs.rmSync(cwd, { recursive: true, force: true });
  fs.mkdirSync(cwd);
  for (const d of ['dist', 'dist-electron', 'build']) fs.cpSync(path.join(appDir, d), path.join(cwd, d), { recursive: true });
  const pkg = JSON.parse(fs.readFileSync(path.join(appDir, 'package.json'), 'utf8'));
  delete pkg.devDependencies;
  delete pkg.scripts;
  fs.writeFileSync(path.join(cwd, 'package.json'), JSON.stringify(pkg, null, 2));
  const yml = fs.readFileSync(path.join(appDir, 'electron-builder.yml'), 'utf8').replace(`output: ../../release/${app}`, `output: ${path.join(root, 'release', app).replace(/\\/g, '/')}`);
  fs.writeFileSync(path.join(cwd, 'electron-builder.yml'), yml);
}
const bin = deep ? path.join(path.dirname(cwd), 'node_modules', '.bin', 'electron-builder') : path.join(root, 'node_modules', '.bin', 'electron-builder');
run(bin, ['--config', 'electron-builder.yml', '--publish', 'never', ...flags], cwd);
console.log(`\nInstallers in ${path.join(root, 'release', app)}`);

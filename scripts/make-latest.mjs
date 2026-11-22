// Builds latest.json (the update feed) from a folder of release files:
//   node scripts/make-latest.mjs <folder> <version> <owner/repo>
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const [dir, version, repo] = process.argv.slice(2);
if (!dir || !version || !repo) throw new Error('usage: make-latest.mjs <folder> <version> <owner/repo>');
const v = version.replace(/^v/, '');
const files = fs.readdirSync(dir, { recursive: true }).map(String).filter((f) => fs.statSync(path.join(dir, f)).isFile());
const apps = { client: {}, server: {}, cli: {} };
const add = (app, key, rel) => {
  const buf = fs.readFileSync(path.join(dir, rel));
  const file = path.basename(rel);
  apps[app][key] = {
    file,
    url: `https://github.com/${repo}/releases/download/v${v}/${encodeURIComponent(file)}`,
    sha512: crypto.createHash('sha512').update(buf).digest('hex'),
    size: buf.length,
  };
};
for (const rel of files) {
  const f = path.basename(rel);
  const app = f.startsWith('EasyServer-Server-') ? 'server' : f.startsWith('EasyServer-') ? 'client' : f.startsWith('easyserver-') ? 'cli' : null;
  if (!app) continue;
  if (app === 'cli') {
    const m = f.match(/^easyserver-(macos|linux|windows)-(arm64|x64)(\.exe)?$/);
    if (m) add('cli', `${{ macos: 'darwin', linux: 'linux', windows: 'win32' }[m[1]]}-${m[2]}`, rel);
  } else if (f.endsWith('.exe')) add(app, 'win32-x64', rel);
  else if (f.endsWith('.zip')) add(app, `darwin-${f.includes('arm64') ? 'arm64' : 'x64'}`, rel);
  else if (f.endsWith('.AppImage')) add(app, 'linux-x64', rel);
}
const manifest = { version: v, released: new Date().toISOString(), apps };
fs.writeFileSync(path.join(dir, 'latest.json'), JSON.stringify(manifest, null, 2));
for (const [k, a] of Object.entries(apps)) console.log(k.padEnd(7), Object.keys(a).join(', ') || '(none)');

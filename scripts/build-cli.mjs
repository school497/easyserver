// Cross-compiles the `easyserver` CLI into single-file executables with Bun (no runtime needed on the server).
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { defines, root } from './env.mjs';

const targets = [
  ['bun-darwin-arm64', 'easyserver-macos-arm64'],
  ['bun-darwin-x64', 'easyserver-macos-x64'],
  ['bun-linux-x64', 'easyserver-linux-x64'],
  ['bun-linux-arm64', 'easyserver-linux-arm64'],
  ['bun-windows-x64', 'easyserver-windows-x64.exe'],
];
const only = process.argv[2];
const out = path.join(root, 'dist', 'cli');
fs.mkdirSync(out, { recursive: true });
const bun = path.join(path.dirname(createRequire(import.meta.url).resolve('bun/package.json')), 'bin', process.platform === 'win32' ? 'bun.exe' : 'bun');

for (const [target, name] of targets) {
  if (only && !target.includes(only)) continue;
  console.log(`→ ${name}`);
  execFileSync(
    bun,
    [
      'build', path.join(root, 'packages/agent/src/cli.ts'),
      '--compile', `--target=${target}`, '--minify',
      ...Object.entries(defines()).flatMap(([k, v]) => ['--define', `${k}=${v}`]),
      '--outfile', path.join(out, name),
    ],
    { stdio: 'inherit', cwd: root },
  );
}
console.log(`\nBinaries in ${out}`);

// Tests every bundled plugin: manifests validate, commands render on all three platforms,
// scripts parse, and the plugins whose tools exist on this machine really run.
// Run: node scripts/test/run-plugins.mjs   (ES_QUICK=1 skips the real runs)
import fs from 'node:fs';
import os from 'node:os';
import net from 'node:net';
import path from 'node:path';
import assert from 'node:assert/strict';
import { execFile, execFileSync } from 'node:child_process';
import { validateManifest, defaultSettings, pluginFolders, type PluginManifest, type Platform } from '../../packages/core/src';
import { render } from '../../packages/agent/src/util';
import { buildCommand, resolveCandidate } from '../../packages/agent/src/runtime';
import { PluginManager } from '../../packages/agent/src/plugins';

const ROOT = path.resolve('plugins');
const slugs = fs.readdirSync(ROOT).filter((d) => !d.startsWith('_') && fs.existsSync(path.join(ROOT, d, 'easyserver.plugin.json')));
let n = 0;
const ok = (s: string) => console.log(`  ok ${++n}  ${s}`);
const skip = (s: string) => console.log(`  --     ${s}`);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const has = (cmd: string) => {
  try {
    execFileSync(process.platform === 'win32' ? 'where' : 'which', [cmd], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
};

async function main() {
  console.log(`static checks (${slugs.length} plugins)`);
  const manifests: Record<string, PluginManifest> = {};
  for (const slug of slugs) {
    const m = JSON.parse(fs.readFileSync(path.join(ROOT, slug, 'easyserver.plugin.json'), 'utf8'));
    const v = validateManifest(m);
    assert.ok(v.ok, `${slug}: ${JSON.stringify((v as any).errors)}`);
    for (const f of m.files) assert.ok(fs.existsSync(path.join(ROOT, slug, f)), `${slug}: missing ${f}`);
    manifests[slug] = m;
  }
  ok('all manifests validate and every listed file exists');

  for (const slug of slugs) {
    const m = manifests[slug];
    for (const plat of m.platforms as Platform[]) {
      const ctx = {
        pluginDir: '/p/pkg', runtimeDir: '/p/rt', dataDir: '/p/data', logsDir: '/p/logs', platform: plat, arch: 'x64',
        isWin: plat === 'win32', isMac: plat === 'darwin', isLinux: plat === 'linux', isArm: false, isX64: true,
        host: '192.168.1.5', hostname: 'box', home: '/home/me', settings: defaultSettings(m), files: {},
        bin: Object.fromEntries((m.requires ?? []).map((r) => [r.id, `/bin/${r.id}`])),
        req: Object.fromEntries((m.requires ?? []).map((r) => [r.id, { webdir: '/w', ffmpeg: '/f' }])),
        env: { LOCALAPPDATA: 'C:/Users/me/AppData/Local', APPDATA: 'C:/Users/me/AppData/Roaming' },
      };
      const run = m.platformRun?.[plat] ?? m.run;
      const cmds = [run, run.stop, ...(m.actions ?? [])].filter(Boolean) as any[];
      for (const c of cmds) {
        const built = buildCommand(c, ctx);
        const all = [built.command, ...built.args, ...Object.values(c.env ?? {}).map((e: any) => render(e, ctx))];
        for (const s of all) assert.ok(!/\{\{|undefined|\[object/.test(s), `${slug}/${plat}: bad render “${s}”`);
      }
      for (const r of m.requires ?? []) {
        assert.ok((r.candidates[plat] ?? []).length, `${slug}/${plat}: no candidates for ${r.id}`);
        for (const step of r.install?.[plat] ?? []) {
          const s = typeof step === 'string' ? render(step, ctx) : [step.command, ...(step.args ?? []).map((a) => render(a, ctx))].join(' ');
          assert.ok(!/\{\{|undefined/.test(s), `${slug}/${plat}: bad install render “${s}”`);
        }
      }
      for (const f of pluginFolders(m)) assert.ok(render(f.root, ctx).startsWith('/p/'), `${slug}: folder outside plugin`);
    }
  }
  ok('run, stop, actions, env and install steps render cleanly on macOS, Linux and Windows');

  const scripts = slugs.flatMap((s) => manifests[s].files.filter((f) => f.endsWith('.mjs')).map((f) => path.join(ROOT, s, f)));
  for (const f of scripts) execFileSync(process.execPath, ['--check', f]);
  ok(`${scripts.length} plugin scripts parse`);

  // Specific renders worth pinning down.
  const g = fs.mkdtempSync(path.join(os.tmpdir(), 'glob-'));
  for (const v of ['jdk-21.0.9', 'jdk-21.0.10', 'jdk-17']) fs.mkdirSync(path.join(g, v, 'bin'), { recursive: true }), fs.writeFileSync(path.join(g, v, 'bin', 'java'), '');
  const gp = g.split(path.sep).join('/');
  assert.equal(resolveCandidate(`${gp}/jdk-21*/bin/java`, {}), `${gp}/jdk-21.0.10/bin/java`);
  assert.equal(resolveCandidate(`${gp}/jdk-9*/bin/java`, {}), null);
  assert.ok(resolveCandidate(`@path:${process.platform === 'win32' ? 'cmd' : 'sh'}`, {}));
  assert.equal(resolveCandidate('@path:definitely-not-a-real-binary', {}), null);
  ok('requirement paths: * picks the newest version, @path searches PATH');

  const term = manifests['terminal'];
  const tctx = (plat: string, settings: any) => ({ ...defaultCtx(plat), settings: { ...defaultSettings(term), ...settings }, bin: { ttyd: 'ttyd' } });
  const targs = buildCommand(term.run, tctx('win32', { password: 'secret123' })).args;
  assert.equal(targs[targs.length - 1], 'powershell.exe');
  assert.ok(targs.includes('--interface') && targs.includes('127.0.0.1') && !targs.includes('--cwd'));
  const targs2 = buildCommand(term.run, tctx('darwin', { password: 'x', listen: 'all', shell: 'fish', startDir: '/srv', writable: false })).args;
  assert.equal(targs2[targs2.length - 1], 'fish');
  assert.ok(!targs2.includes('--interface') && targs2.includes('--cwd') && !targs2.includes('--writable'));
  const cf = manifests['cloudflare-tunnel'];
  const quick = buildCommand(cf.run, { ...defaultCtx('linux'), settings: defaultSettings(cf), bin: { cloudflared: 'cf' } });
  assert.deepEqual(quick.args.slice(-2), ['--url', 'http://localhost:8080']);
  assert.equal(quick.env.TUNNEL_TOKEN, undefined);
  const named = buildCommand(cf.run, { ...defaultCtx('linux'), settings: { ...defaultSettings(cf), mode: 'token', token: 'tok' }, bin: { cloudflared: 'cf' } });
  assert.equal(named.args[named.args.length - 1], 'run');
  assert.equal(named.env.TUNNEL_TOKEN, 'tok');
  ok('Terminal and Cloudflare flags switch correctly with settings');

  const kcfg = execFileSync(process.execPath, [path.join(ROOT, 'kubernetes/scripts/cluster.mjs'), 'config'], {
    env: { ...process.env, ES_SETTINGS: JSON.stringify({ clusterName: 'demo', workers: 2, apiPort: 7000, httpPort: 8088, httpsPort: 8443 }), ES_DATA_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'k8s-')) },
  }).toString();
  assert.match(kcfg, /name: demo/);
  assert.equal((kcfg.match(/role: worker/g) ?? []).length, 2);
  assert.match(kcfg, /hostPort: 8088/);
  assert.match(kcfg, /apiServerPort: 7000/);
  ok('Kubernetes kind config: workers, API port and ingress ports');

  process.env.ES_TEST = '1';
  process.env.ES_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'conv-'));
  const { ffmpegArgs, kindOf } = await import(pathUrl('converter/scripts/converter.mjs'));
  delete process.env.ES_TEST;
  if (ffmpegArgs) {
    assert.equal(kindOf('a.HEIC'), 'image');
    assert.equal(kindOf('b.mkv'), 'video');
    const a = ffmpegArgs('video', 'in.mov', 'out.mp4', { videoFormat: 'mp4', videoQuality: 20, maxHeight: '720', speed: 'fast' });
    assert.ok(a.includes('libx264') && a.includes('veryfast') && a.includes('+faststart') && a.join(' ').includes("min(720,ih)"));
    ok('Converter builds the right FFmpeg arguments');
  }

  // Fake RCON server for the Minecraft console client.
  const rconOut = await fakeRcon(
    (port) =>
      new Promise<string>((res, rej) =>
        execFile(process.execPath, [path.join(ROOT, 'minecraft/scripts/rcon.mjs'), 'list'], {
          env: { ...process.env, ES_SETTINGS: JSON.stringify({ rconPort: port, rconPassword: 'pw' }), ES_DATA_DIR: os.tmpdir() },
        }, (e, out, err) => (e ? rej(new Error(err || e.message)) : res(out))),
      ),
  );
  assert.match(rconOut, /There are 0 of a max of 10 players online/);
  ok('Minecraft RCON client authenticates and runs a command');

  if (process.env.ES_QUICK) return done();

  console.log('\nreal runs on this machine');
  const mojang = execFileSync(process.execPath, [path.join(ROOT, 'minecraft/scripts/fetch-server.mjs'), '--dry-run', 'latest'], { env: { ...process.env, ES_DATA_DIR: os.tmpdir() } }).toString();
  const v = JSON.parse(mojang);
  assert.match(v.url, /^https:\/\/piston-data\.mojang\.com\/.+server\.jar$/);
  assert.match(v.sha1, /^[0-9a-f]{40}$/);
  ok(`Mojang manifest resolves latest release ${v.id} (Java ${v.java})`);

  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'es-plugins-'));
  const records: Record<string, any> = {};
  const settings: Record<string, any> = {
    terminal: { password: 'easy-test-pass', port: 17681 },
    converter: { scanSeconds: 2 },
    ollama: { port: 11500, pullOnStart: false, models: [] },
    minecraft: { eula: true, port: 25599, rconPort: 25598, memory: 1536, viewDistance: 4, simulationDistance: 4 },
    'cloudflare-tunnel': {},
  };
  for (const slug of Object.keys(settings)) {
    const m = manifests[slug];
    fs.cpSync(path.join(ROOT, slug), path.join(home, 'plugins', m.id, 'package'), { recursive: true });
    records[m.id] = { manifest: m, settings: { ...defaultSettings(m), ...settings[slug] }, sourceUrl: 'test', desired: 'stopped', installedAt: new Date().toISOString() };
  }
  fs.writeFileSync(path.join(home, 'plugins.json'), JSON.stringify(records));
  const pm = new PluginManager({
    home,
    log: () => {},
    onChange: () => {},
    isApprovedSource: async () => true,
    takeTransfer: async () => new Uint8Array(),
    putTransfer: async () => 'x',
    serverId: () => 's',
    privateKey: () => ({}),
  });
  const id = (slug: string) => manifests[slug].id;
  const dirs = (slug: string) => pm.dirs(id(slug));

  // Terminal: downloads ttyd, serves a password-protected terminal.
  await pm.reinstallRequirements(id('terminal'));
  await pm.start(id('terminal'));
  const unauth = await fetch('http://127.0.0.1:17681/');
  const authed = await fetch('http://127.0.0.1:17681/', { headers: { Authorization: 'Basic ' + Buffer.from('admin:easy-test-pass').toString('base64') } });
  assert.equal(unauth.status, 401);
  assert.equal(authed.status, 200);
  assert.match(await authed.text(), /ttyd/i);
  await pm.stop(id('terminal'));
  ok('Terminal: ttyd downloaded, refuses without the password, serves with it, stops');

  // Cloudflare Tunnel: downloads cloudflared and runs it (no tunnel opened).
  await pm.reinstallRequirements(id('cloudflare-tunnel'));
  const cfv = await pm.runAction(id('cloudflare-tunnel'), 'version');
  assert.equal(cfv.code, 0);
  assert.match(cfv.output, /cloudflared version/);
  ok(`Cloudflare Tunnel: cloudflared downloaded (${cfv.output.split('\n')[0].trim()})`);

  // Converter: real FFmpeg conversions through the Inbox watcher.
  if (has('ffmpeg')) {
    await pm.reinstallRequirements(id('converter'));
    const inbox = path.join(dirs('converter').data, 'inbox', 'album');
    fs.mkdirSync(inbox, { recursive: true });
    execFileSync('ffmpeg', ['-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc=size=640x360', '-frames:v', '1', path.join(inbox, 'pic.png')]);
    execFileSync('ffmpeg', ['-loglevel', 'error', '-f', 'lavfi', '-i', 'sine=d=1', path.join(inbox, 'tone.wav')]);
    fs.writeFileSync(path.join(inbox, 'notes.xyz'), 'not media');
    const old = new Date(Date.now() - 60_000);
    for (const f of fs.readdirSync(inbox)) fs.utimesSync(path.join(inbox, f), old, old);
    await pm.start(id('converter'));
    const conv = path.join(dirs('converter').data, 'converted', 'album');
    for (let i = 0; i < 40 && !(fs.existsSync(path.join(conv, 'pic.webp')) && fs.existsSync(path.join(conv, 'tone.mp3'))); i++) await sleep(500);
    await sleep(1500);
    assert.ok(fs.existsSync(path.join(conv, 'pic.webp')) && fs.existsSync(path.join(conv, 'tone.mp3')));
    assert.ok(fs.existsSync(path.join(dirs('converter').data, 'originals', 'album', 'pic.png')));
    assert.ok(fs.existsSync(path.join(dirs('converter').data, 'failed', 'album', 'notes.xyz')));
    const files = await pm.listFiles(id('converter'), 'converted');
    assert.deepEqual(files.files.map((f) => f.path).sort(), ['album/pic.webp', 'album/tone.mp3']);
    await pm.stop(id('converter'));
    ok('Converter: PNG → WebP and WAV → MP3, original kept, unknown file sent to Failed');
  } else skip('Converter (FFmpeg not installed)');

  // Ollama: real `ollama serve` on a spare port, via the plugin's launcher.
  if (has('ollama')) {
    await pm.reinstallRequirements(id('ollama'));
    await pm.start(id('ollama'));
    const ver = await (await fetch('http://127.0.0.1:11500/api/version')).json();
    assert.ok(ver.version);
    assert.equal(pm.get(id('ollama')).status, 'running');
    const list = await pm.runAction(id('ollama'), 'list');
    assert.equal(list.code, 0);
    assert.match(list.output, /NAME/);
    await pm.stop(id('ollama'));
    ok(`Ollama: served ${ver.version} on its own port with this plugin’s model folder`);
  } else skip('Ollama (not installed)');

  // Minecraft: download the official server, start a world, talk to it, back it up, stop gracefully.
  if (has('java')) {
    await pm.reinstallRequirements(id('minecraft'));
    assert.ok(fs.existsSync(path.join(dirs('minecraft').data, 'server', 'server.jar')));
    await pm.start(id('minecraft'));
    let up = false;
    for (let i = 0; i < 120 && !up; i++) {
      up = (await pm.runAction(id('minecraft'), 'players')).code === 0;
      if (!up) await sleep(2000);
    }
    assert.ok(up, 'server never accepted RCON');
    const who = await pm.runAction(id('minecraft'), 'players');
    assert.match(who.output, /players online/);
    const props = fs.readFileSync(path.join(dirs('minecraft').data, 'server', 'server.properties'), 'utf8');
    assert.match(props, /server-port=25599/);
    assert.match(props, /view-distance=4/);
    const bk = await pm.runAction(id('minecraft'), 'backup');
    assert.match(bk.output, /started/);
    for (let i = 0; i < 60 && !(await pm.listFiles(id('minecraft'), 'backups')).files.length; i++) await sleep(1000);
    await sleep(2000);
    const backups = (await pm.listFiles(id('minecraft'), 'backups')).files;
    assert.equal(backups.length, 1);
    await pm.stop(id('minecraft'));
    const log = fs.readFileSync(path.join(dirs('minecraft').logs, 'process.log'), 'utf8');
    assert.match(log, /Saving worlds|Saving chunks/);
    ok(`Minecraft: ${fs.readFileSync(path.join(dirs('minecraft').data, 'server', 'version.txt'), 'utf8')} downloaded and verified, world up, RCON, backup (${(backups[0].size / 1e6).toFixed(1)} MB), saved on stop`);
  } else skip('Minecraft (Java not installed)');

  fs.rmSync(home, { recursive: true, force: true });
  done();
}

function defaultCtx(plat: string) {
  return {
    pluginDir: '/p/pkg', runtimeDir: '/p/rt', dataDir: '/p/data', logsDir: '/p/logs', platform: plat,
    isWin: plat === 'win32', isMac: plat === 'darwin', isLinux: plat === 'linux', isArm: false, isX64: true, host: 'h', hostname: 'box', env: {},
  };
}
function pathUrl(rel: string) {
  return 'file:///' + path.join(ROOT, rel).replace(/\\/g, '/').replace(/^\/+/, '');
}
function done() {
  console.log(`\n${n} plugin checks passed`);
  process.exit(0);
}

/** Minimal RCON server answering `list`. */
function fakeRcon(fn: (port: number) => Promise<string> | string): Promise<string> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer((sock) => {
      let buf = Buffer.alloc(0);
      sock.on('data', (d) => {
        buf = Buffer.concat([buf, d]);
        while (buf.length >= 4 && buf.length >= buf.readInt32LE(0) + 4) {
          const len = buf.readInt32LE(0);
          const reqId = buf.readInt32LE(4);
          const type = buf.readInt32LE(8);
          const body = buf.slice(12, 4 + len - 2).toString();
          buf = buf.slice(4 + len);
          const reply = (rid: number, t: number, text: string) => {
            const b = Buffer.from(text);
            const p = Buffer.alloc(14 + b.length);
            p.writeInt32LE(10 + b.length, 0);
            p.writeInt32LE(rid, 4);
            p.writeInt32LE(t, 8);
            b.copy(p, 12);
            sock.write(p);
          };
          if (type === 3) reply(body === 'pw' ? reqId : -1, 2, '');
          else reply(reqId, 0, body === 'list' ? 'There are 0 of a max of 10 players online: ' : '');
        }
      });
    });
    srv.listen(0, '127.0.0.1', async () => {
      try {
        const out = await fn((srv.address() as any).port);
        srv.close();
        resolve(out);
      } catch (e) {
        srv.close();
        reject(e);
      }
    });
  });
}

main().catch((e) => {
  console.error('FAILED:', e);
  process.exit(1);
});

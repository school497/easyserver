// Offline self-test for core + agent (no Supabase needed). Run: node scripts/test/run.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { generateKeyPair, seal, open, validateManifest, parseGithubUrl, rawUrl, sanitizeSettings, defaultSettings, rankTrending, pluginFolders, settingFolderId } from '../../packages/core/src';
import { render, safeJoin } from '../../packages/agent/src/util';
import { PluginManager } from '../../packages/agent/src/plugins';

let n = 0;
const ok = (name: string) => console.log(`  ok ${++n}  ${name}`);

async function main() {
  console.log('core');
  const kp = await generateKeyPair();
  const msg = new TextEncoder().encode('<h1>hello</h1>');
  const s = await seal(kp.publicJwk, 'srv-1', 'index.html', msg);
  assert.deepEqual(await open(kp.privateJwk, 'srv-1', 'index.html', s, s.ciphertext), msg);
  ok('E2E seal/open round-trip');
  await assert.rejects(open(kp.privateJwk, 'srv-2', 'index.html', s, s.ciphertext));
  await assert.rejects(open(kp.privateJwk, 'srv-1', 'other.html', s, s.ciphertext));
  const tampered = s.ciphertext.slice();
  tampered[0] ^= 1;
  await assert.rejects(open(kp.privateJwk, 'srv-1', 'index.html', s, tampered));
  const other = await generateKeyPair();
  await assert.rejects(open(other.privateJwk, 'srv-1', 'index.html', s, s.ciphertext));
  ok('rejects wrong server, renamed path, tampering, wrong key');

  const manifest = JSON.parse(fs.readFileSync('plugins/apache/easyserver.plugin.json', 'utf8'));
  const v = validateManifest(manifest);
  assert.ok(v.ok, JSON.stringify((v as any).errors));
  ok('Apache manifest is valid');
  assert.equal(validateManifest({ ...manifest, files: ['../evil'] }).ok, false);
  ok('manifest rejects path traversal');

  assert.deepEqual(parseGithubUrl('https://github.com/me/plugins/tree/main/apache'), { owner: 'me', repo: 'plugins', ref: 'main', dir: 'apache' });
  assert.deepEqual(parseGithubUrl('https://github.com/me/apache.git'), { owner: 'me', repo: 'apache', ref: 'HEAD', dir: '' });
  assert.deepEqual(parseGithubUrl('https://raw.githubusercontent.com/me/p/v1/a/easyserver.plugin.json'), { owner: 'me', repo: 'p', ref: 'v1', dir: 'a' });
  assert.equal(rawUrl(parseGithubUrl('https://github.com/me/p'), 'icon.svg'), 'https://raw.githubusercontent.com/me/p/HEAD/icon.svg');
  assert.throws(() => rawUrl(parseGithubUrl('https://github.com/me/p'), '../x'));
  ok('GitHub URL parsing');

  assert.throws(() => sanitizeSettings(manifest, { port: 80 }));
  assert.throws(() => sanitizeSettings(manifest, { index: 'a\nInclude /etc/passwd' }));
  assert.equal(sanitizeSettings(manifest, { port: '9090' }).port, 9090);
  ok('settings validation');

  assert.throws(() => safeJoin('/tmp/x', '../y'));
  assert.throws(() => safeJoin('/tmp/x', 'a/../../y'));
  ok('safeJoin blocks escapes');

  const tpl = fs.readFileSync('plugins/apache/templates/httpd.conf', 'utf8');
  const ctxBase = { runtimeDir: '/r', dataDir: '/d', logsDir: '/l', hostname: 'h', req: { httpd: { modules: '/m' } }, settings: { ...defaultSettings(manifest) } };
  const unix = render(tpl, { ...ctxBase, isWin: false });
  assert.match(unix, /^Listen 8080$/m);
  assert.match(unix, /mod_mpm_prefork\.so/);
  assert.match(unix, /Options -Indexes \+FollowSymLinks/);
  assert.doesNotMatch(unix, /\{\{/);
  const win = render(tpl, { ...ctxBase, isWin: true, settings: { ...ctxBase.settings, listen: 'local', listing: true } });
  assert.match(win, /^Listen 127\.0\.0\.1:8080$/m);
  assert.doesNotMatch(win, /mod_unixd/);
  assert.match(win, /Options \+Indexes/);
  ok('Apache config template renders for unix + windows');

  assert.match(unix, /^DirectoryIndex index\.html index\.htm$/m);
  assert.doesNotMatch(unix, /ErrorDocument/);
  const custom = render(tpl, { ...ctxBase, isWin: false, files: { notFoundPage: '/d/settings/notFoundPage/404.html' }, settings: { ...ctxBase.settings, extraIndex: ['a.html', 'b.htm'] } });
  assert.match(custom, /^DirectoryIndex index\.html a\.html b\.htm$/m);
  assert.match(custom, /ErrorDocument 404 \/__easyserver\/404\.html/);
  assert.match(custom, /MaxRequestWorkers 150/);
  ok('Apache template: lists via #each, file setting, slider');

  assert.equal(render('{{a|json}} {{a|space}} {{a|lines}} {{#if e}}x{{/if}}{{#unless e}}y{{/unless}}', { a: ['p', 'q'], e: [] }), '["p","q"] p q p\nq y');
  ok('template filters and empty-list falsiness');

  const rich: any = {
    ...manifest,
    settings: [
      { key: 'mode', label: 'Mode', type: 'select', default: 'a', options: [{ label: 'A', value: 'a' }, { label: 'B', value: 'b' }] },
      { key: 'token', label: 'Token', type: 'password', default: '', required: true, visibleIf: { key: 'mode', equals: 'b' } },
      { key: 'level', label: 'Level', type: 'slider', default: 5, min: 0, max: 10, step: 0.5 },
      { key: 'tags', label: 'Tags', type: 'multiselect', default: [], options: [{ label: 'X', value: 'x' }, { label: 'Y', value: 'y' }] },
      { key: 'hosts', label: 'Hosts', type: 'list', default: [], pattern: '^[a-z.]+$', maxItems: 2 },
      { key: 'tint', label: 'Tint', type: 'color', default: '#336699' },
      { key: 'mail', label: 'Mail', type: 'email', default: '' },
      { key: 'site', label: 'Site', type: 'url', default: '' },
      { key: 'notes', label: 'Notes', type: 'text', default: 'line1\nline2' },
      { key: 'cert', label: 'Cert', type: 'file', default: '', accept: ['.pem'] },
    ],
  };
  assert.ok(validateManifest(rich).ok, JSON.stringify((validateManifest(rich) as any).errors));
  assert.equal(validateManifest({ ...rich, settings: [{ key: 'k', label: 'K', type: 'nope', default: '' }] }).ok, false);
  const good = sanitizeSettings(rich, { level: '7.3', tags: ['y', 'x'], hosts: 'a.com\nb.org', notes: 'x\ny' });
  assert.equal(good.level, 7.5);
  assert.deepEqual(good.hosts, ['a.com', 'b.org']);
  assert.equal(good.notes, 'x\ny');
  assert.throws(() => sanitizeSettings(rich, { mode: 'b' }), /Token is required/);
  assert.doesNotThrow(() => sanitizeSettings(rich, { mode: 'a' }));
  assert.throws(() => sanitizeSettings(rich, { tags: ['z'] }));
  assert.throws(() => sanitizeSettings(rich, { hosts: ['a.com', 'b.com', 'c.com'] }));
  assert.throws(() => sanitizeSettings(rich, { hosts: ['BAD HOST'] }));
  assert.throws(() => sanitizeSettings(rich, { tint: 'blue' }));
  assert.throws(() => sanitizeSettings(rich, { mail: 'nope' }));
  assert.throws(() => sanitizeSettings(rich, { site: 'ftp://x' }));
  assert.throws(() => sanitizeSettings(rich, { cert: '../x.pem' }));
  ok('all setting types validate (required + visibleIf, slider step, lists, color, email, url, file)');

  assert.deepEqual(pluginFolders({ ...manifest, folders: undefined, content: undefined }).map((f) => f.id), ['files']);
  assert.deepEqual(pluginFolders(manifest).map((f) => f.id), ['site']);
  ok('every plugin gets a file-transfer folder by default');

  const ranked = rankTrending([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }], [{ plugin_id: 'b', day: new Date().toISOString().slice(0, 10), installs: 3, uninstalls: 0 }]);
  assert.equal(ranked[0].id, 'b');
  ok('trending ranks recent installs first');

  console.log('agent plugin lifecycle');
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'es-test-'));
  const port = 20000 + Math.floor(Math.random() * 20000);
  const id = 'dev.test.node';
  const m = {
    schema: 1, id, name: 'Node Test', version: '1.0.0', developer: 't', description: 'd', category: 'computing', icon: 'i.svg',
    platforms: ['darwin', 'linux', 'win32'], files: ['i.svg', 'server.js'],
    requires: [{ id: 'node', label: 'Node', candidates: { [process.platform]: [{ path: process.execPath.replace(/\\/g, '/') }] } }],
    settings: [{ key: 'port', label: 'Port', type: 'port', default: port }, { key: 'cert', label: 'Cert', type: 'file', default: '', accept: ['.pem'] }],
    templates: [{ src: 'server.js', dest: 'server.js' }],
    run: { command: '{{bin.node}}', args: ['{{runtimeDir}}/server.js'] },
    health: { type: 'http', target: 'http://127.0.0.1:{{settings.port}}/' },
    logs: [{ id: 'app', label: 'App', path: '{{logsDir}}/process.log' }],
    folders: [{ id: 'site', label: 'Files', root: '{{dataDir}}/site', accept: ['.html'] }, { id: 'backups', label: 'Backups', root: '{{dataDir}}/backups' }],
    actions: [{ id: 'ver', label: 'Version', command: '{{bin.node}}', args: ['--version'] }],
  };
  assert.ok(validateManifest(m).ok);
  const pkg = path.join(home, 'plugins', id, 'package');
  fs.mkdirSync(pkg, { recursive: true });
  fs.writeFileSync(path.join(pkg, 'server.js'), "require('http').createServer((q,s)=>{console.log('hit '+q.url);s.end('ok')}).listen({{settings.port}},'127.0.0.1')");
  fs.writeFileSync(path.join(home, 'plugins.json'), JSON.stringify({ [id]: { manifest: m, settings: { port }, sourceUrl: 'x', desired: 'stopped', installedAt: new Date().toISOString() } }));
  const transfers = new Map<string, Uint8Array>();
  let outCount = 0;
  const pm = new PluginManager({
    home,
    log: () => {},
    onChange: () => {},
    isApprovedSource: async () => true,
    takeTransfer: async (k) => {
      const val = transfers.get(k)!;
      transfers.delete(k);
      return val;
    },
    putTransfer: async (bytes) => {
      const k = `srv-1/out/${++outCount}`;
      transfers.set(k, bytes);
      return k;
    },
    serverId: () => 'srv-1',
    privateKey: () => kp.privateJwk,
  });
  await pm.start(id);
  assert.equal(pm.get(id).status, 'running');
  assert.equal(await (await fetch(`http://127.0.0.1:${port}/`)).text(), 'ok');
  ok('starts process from manifest, health check passes');
  await new Promise((r) => setTimeout(r, 300));
  const logs = await pm.logs(id, 'app', 10);
  assert.ok(logs.lines.some((l) => l.includes('hit /')), JSON.stringify(logs));
  ok('reads logs');
  const act = await pm.runAction(id, 'ver');
  assert.equal(act.code, 0);
  assert.match(act.output, /^v\d+/);
  ok('runs actions');
  const sealed = await seal(kp.publicJwk, 'srv-1', 'blog/index.html', msg);
  transfers.set('srv-1/obj1', sealed.ciphertext);
  await pm.receiveFiles(id, [{ path: 'blog/index.html', object: 'srv-1/obj1', size: msg.length, epk: sealed.epk, iv: sealed.iv, salt: sealed.salt, sha256: sealed.sha256 }]);
  const list = await pm.listFiles(id);
  assert.deepEqual(list.files.map((f) => f.path), ['blog/index.html']);
  assert.equal((await pm.listFiles(id, 'site')).files.length, 1);
  assert.equal(transfers.size, 0);
  ok('receives an encrypted upload into the content folder');
  await assert.rejects(pm.writeLocalFiles(id, [{ path: 'x.php', data: msg }]));
  await assert.rejects(pm.writeLocalFiles(id, [{ path: '../../escape.html', data: msg }]));
  ok('blocks disallowed types and traversal on upload');
  await pm.deleteFile(id, 'blog/index.html');
  assert.equal((await pm.listFiles(id)).files.length, 0);
  ok('deletes files');
  await pm.writeLocalFiles(id, [{ path: 'db.sqlite', data: msg }], 'backups');
  assert.deepEqual((await pm.listFiles(id, 'backups')).files.map((f) => f.path), ['db.sqlite']);
  ok('second folder works independently');

  const client = await generateKeyPair();
  const ref = await pm.sendFile(id, 'db.sqlite', client.publicJwk, 'backups');
  const back = await open(client.privateJwk, 'srv-1', 'db.sqlite', ref, transfers.get(ref.object)!);
  assert.deepEqual(back, msg);
  await assert.rejects(open(kp.privateJwk, 'srv-1', 'db.sqlite', ref, transfers.get(ref.object)!));
  ok('encrypted download: only the requesting client can open it');

  await assert.rejects(pm.writeLocalFiles(id, [{ path: 'key.txt', data: msg }], settingFolderId('cert')));
  await pm.writeLocalFiles(id, [{ path: 'old.pem', data: msg }], settingFolderId('cert'));
  await pm.writeLocalFiles(id, [{ path: 'new.pem', data: msg }], settingFolderId('cert'));
  assert.deepEqual((await pm.listFiles(id, settingFolderId('cert'))).files.map((f) => f.path), ['new.pem']);
  await pm.updateSettings(id, { cert: 'new.pem' });
  const ctx: any = await pm.context(id);
  assert.ok(ctx.files.cert.endsWith('/settings/cert/new.pem') && fs.existsSync(ctx.files.cert));
  ok('file setting: upload replaces previous file, exposed as {{files.cert}}');

  await pm.updateSettings(id, { port: port + 1 });
  assert.equal(await (await fetch(`http://127.0.0.1:${port + 1}/`)).text(), 'ok');
  ok('settings change restarts with new port');
  await pm.stop(id);
  assert.equal(pm.get(id).status, 'stopped');
  ok('stops');
  await pm.uninstall(id);
  assert.equal(fs.existsSync(path.join(home, 'plugins', id)), false);
  ok('uninstalls');
  console.log(`\n${n} checks passed`);
}
main().catch((e) => {
  console.error('FAILED:', e);
  process.exit(1);
});

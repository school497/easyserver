// Live end-to-end test against the Supabase project in .env. Creates a throwaway server, pairs a
// client, drives it through commands, then deletes everything. Run: node scripts/test/run-e2e.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_KEY, SUPABASE_URL } from '../../packages/core/src';

const home = fs.mkdtempSync(path.join(os.tmpdir(), 'es-e2e-'));
process.env.EASYSERVER_HOME = home;

let n = 0;
const ok = (s: string) => console.log(`  ok ${++n}  ${s}`);
const waitFor = async (fn: () => Promise<boolean>, ms = 20_000) => {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    if (await fn()) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('timed out');
};

async function main() {
  const { Agent } = await import('../../packages/agent/src/agent');
  const { ClientBackend } = await import('../../packages/ui/src/backend/client');

  // Seed a tiny plugin so we can drive start/stop/files without GitHub.
  const port = 30000 + Math.floor(Math.random() * 20000);
  const id = 'dev.test.e2e';
  const manifest = {
    schema: 1, id, name: 'E2E Plugin', version: '1.0.0', developer: 't', description: 'd', category: 'computing', icon: 'i.svg',
    platforms: ['darwin', 'linux', 'win32'], files: ['i.svg', 'server.js'],
    requires: [{ id: 'node', label: 'Node', candidates: { [process.platform]: [{ path: process.execPath.replace(/\\/g, '/') }] } }],
    settings: [{ key: 'port', label: 'Port', type: 'port', default: port }],
    templates: [{ src: 'server.js', dest: 'server.js' }],
    run: { command: '{{bin.node}}', args: ['{{runtimeDir}}/server.js'] },
    health: { type: 'http', target: 'http://127.0.0.1:{{settings.port}}/' },
    links: [{ label: 'Open', url: 'http://{{host}}:{{settings.port}}/' }],
    folders: [{ id: 'site', label: 'Site', root: '{{dataDir}}/site' }],
  };
  fs.mkdirSync(path.join(home, 'plugins', id, 'package'), { recursive: true });
  fs.writeFileSync(path.join(home, 'plugins', id, 'package', 'server.js'), "require('http').createServer((q,s)=>s.end('e2e')).listen({{settings.port}},'127.0.0.1')");
  fs.writeFileSync(path.join(home, 'plugins.json'), JSON.stringify({ [id]: { manifest, settings: { port }, sourceUrl: 'x', desired: 'stopped', installedAt: new Date().toISOString() } }));

  const agent = new Agent((l, m) => process.env.E2E_DEBUG && console.log('   [agent]', l, m));
  cleanup = async () => {
    await agent.plugins.stopAll();
    await agent.reset();
  };
  console.log(`live e2e against ${SUPABASE_URL}`);
  const { code } = await agent.setup('E2E Test Server');
  assert.match(code, /^[A-HJ-NP-Z]{6}$/);
  ok(`server registered, pairing code ${code}`);

  const client = new ClientBackend();
  const state: any = {};
  await client.init((p) => Object.assign(state, p));
  assert.equal(state.servers.length, 0);
  ok('client signs in anonymously and sees no servers');

  const claimed = agent.waitForClaim();
  await assert.rejects(client.claimCode('AAAAAA'), /not valid/);
  const sid = await client.claimCode(code);
  await claimed;
  assert.equal(sid, agent.serverId);
  assert.equal(state.selectedId, sid);
  ok('wrong code rejected; right code pairs, adds and selects the server');
  await assert.rejects(client.claimCode(code), /not valid/);
  ok('a code works only once');

  await agent.start();
  if (process.env.E2E_DEBUG) {
    await new Promise((r) => setTimeout(r, 3000));
    console.log('   agent sees', (await agent.sb.from('installed_plugins').select('plugin_id,status')).data, (await agent.sb.from('server_status').select('server_id')).error);
    console.log('   client sees', (await client.sb.from('installed_plugins').select('plugin_id,status')).data, (await client.sb.from('server_status').select('server_id')).data, 'state', state.plugins?.length, !!state.status);
  }
  await waitFor(async () => state.plugins?.length === 1 && !!state.status);
  ok('agent online: status and installed plugins reach the client over realtime');

  const pong = await client.send('server.ping', {});
  assert.ok(pong.pong);
  ok('client command executes on the agent and returns a result');

  await client.send('plugin.start', { pluginId: id }, { timeoutMs: 30_000 });
  await waitFor(async () => state.plugins.find((p: any) => p.plugin_id === id)?.status === 'running');
  assert.equal(await (await fetch(`http://127.0.0.1:${port}/`)).text(), 'e2e');
  assert.match(state.plugins[0].links[0].url, new RegExp(`:${port}/$`));
  ok('remote start: plugin running, status pushed back, links rendered');

  const html = new TextEncoder().encode('<h1>uploaded over e2e</h1>');
  await client.upload(id, [{ path: 'index.html', data: html }], undefined, 'site');
  const listed = await client.send('plugin.files.list', { pluginId: id, folder: 'site' });
  assert.deepEqual(listed.files.map((f: any) => f.path), ['index.html']);
  ok('encrypted upload through Storage lands in the plugin folder');

  const back = await client.download(id, 'index.html', 'site');
  assert.deepEqual(back, html);
  ok('encrypted download round-trips');

  const { data: leftovers } = await client.sb.storage.from('transfers').list(sid, { limit: 100 });
  assert.equal((leftovers ?? []).filter((o: any) => o.id).length, 0);
  ok('no ciphertext left in Storage');

  // A stranger with their own session must see nothing and be unable to command the server.
  const stranger = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });
  await stranger.auth.signInAnonymously();
  const { data: seen } = await stranger.from('servers').select('id').eq('id', sid);
  assert.equal(seen?.length, 0);
  const { error: denied } = await stranger.from('commands').insert({ server_id: sid, type: 'server.ping', payload: {} });
  assert.ok(denied);
  const { data: plugs } = await stranger.from('installed_plugins').select('plugin_id').eq('server_id', sid);
  assert.equal(plugs?.length, 0);
  const { error: upErr } = await stranger.storage.from('transfers').upload(`${sid}/x`, new Blob(['x']));
  assert.ok(upErr);
  ok('RLS: an unpaired user cannot see the server, its plugins, send commands or upload');

  await client.send('plugin.settings', { pluginId: id, settings: { port: port + 1 } }, { timeoutMs: 30_000 });
  await waitFor(async () => state.plugins[0]?.settings?.port === port + 1 && state.plugins[0]?.status === 'running');
  assert.equal(await (await fetch(`http://127.0.0.1:${port + 1}/`)).text(), 'e2e');
  ok('remote settings change restarts the plugin on the new port');

  await assert.rejects(client.send('plugin.settings', { pluginId: id, settings: { port: 99999 } }), /between/);
  ok('invalid settings are rejected by the agent with a readable error');

  await client.send('plugin.stop', { pluginId: id }, { timeoutMs: 30_000 });
  await waitFor(async () => state.plugins[0]?.status === 'stopped');
  ok('remote stop');

  await client.leave(sid);
  assert.equal(state.servers.length, 0);
  ok('client removes the server from its list');

  await agent.reset();
  const { data: gone } = await agent.sb.from('servers').select('id').eq('id', sid);
  assert.equal(gone?.length ?? 0, 0);
  ok('server reset deletes it from Supabase');
  console.log(`\n${n} live checks passed`);
  process.exit(0);
}

let cleanup: (() => Promise<void>) | null = null;
main().catch(async (e) => {
  console.error('FAILED:', e);
  await cleanup?.().catch(() => {});
  process.exit(1);
});

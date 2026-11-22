#!/usr/bin/env node
import readline from 'node:readline/promises';
import { pathToFileURL } from 'node:url';
import { APP_VERSION, isOnline, type CommandType } from '@easyserver/core';
import { Agent } from './agent';
import { installService, uninstallService } from './service';
import { errMsg, sleep } from './util';

const HELP = `EasyServer ${APP_VERSION} — turn this computer into a remotely managed server

Usage: easyserver <command>

  setup [--name NAME]        Name this server, then show a 6-letter code to enter in the client app
  start                      Run the server in the foreground (Ctrl+C to stop)
  pair                       Show a new code to pair another client
  status                     Show this server and its plugins
  plugin <start|stop|restart|uninstall> <plugin-id>
                             Control a plugin (the server must be running)
  service <install|uninstall>
                             Start EasyServer automatically when this computer starts
  clients                    List paired clients
  revoke <client-id>         Remove a paired client
  reset                      Delete this server from EasyServer and forget it
  version | help
`;

const bold = (s: string) => (process.stdout.isTTY ? `\x1b[1m${s}\x1b[0m` : s);
const dim = (s: string) => (process.stdout.isTTY ? `\x1b[2m${s}\x1b[0m` : s);
const dot = (ok: boolean) => (process.stdout.isTTY ? (ok ? '\x1b[32m●\x1b[0m' : '\x1b[31m●\x1b[0m') : ok ? '[up]' : '[down]');

function showCode(code: string, expiresAt: string) {
  const spaced = code.split('').join(' ');
  const mins = Math.round((Date.parse(expiresAt) - Date.now()) / 60000);
  console.log(`\n  Open EasyServer on your other device, choose ${bold('Add Server')}, and enter:\n`);
  console.log(`      ${bold(spaced)}\n`);
  console.log(dim(`  The code expires in ${mins} minutes.\n`));
}

async function waitForClient(agent: Agent, first: { code: string; expiresAt: string }) {
  let current = first;
  showCode(current.code, current.expiresAt);
  process.stdout.write(dim('  Waiting for a client to enter the code…'));
  const refresh = setInterval(async () => {
    if (Date.parse(current.expiresAt) - Date.now() < 30_000) {
      current = await agent.newPairingCode();
      console.log('\n\n  That code expired. Here is a new one:');
      showCode(current.code, current.expiresAt);
    }
  }, 10_000);
  try {
    await agent.waitForClaim();
  } finally {
    clearInterval(refresh);
  }
  console.log(`\n\n  ${dot(true)} Paired. This server now appears in the client app.\n`);
}

async function runForeground(agent: Agent) {
  await agent.start();
  console.log(dim('  Press Ctrl+C to stop.\n'));
  let stopping = false;
  const shutdown = async () => {
    if (stopping) return;
    stopping = true;
    console.log('\nStopping…');
    await agent.stop();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  await new Promise(() => {});
}

async function queue(agent: Agent, type: CommandType, payload: any) {
  await agent.connect();
  const { data, error } = await agent.sb.from('commands').insert({ server_id: agent.serverId, type, payload }).select('id').single();
  if (error) throw new Error(errMsg(error));
  for (let i = 0; i < 120; i++) {
    await sleep(500);
    const { data: row } = await agent.sb.from('commands').select('status, error, result').eq('id', data.id).single();
    if (row?.status === 'done') return row.result;
    if (row?.status === 'error') throw new Error(row.error ?? 'Failed');
  }
  throw new Error('The server did not respond. Is `easyserver start` (or the EasyServer app) running?');
}

async function main() {
  const [cmd = 'help', ...args] = process.argv.slice(2);
  const agent = cmd === '__run-script' ? (null as unknown as Agent) : new Agent();
  const needSetup = () => {
    if (!agent.isSetUp()) throw new Error('This computer is not set up yet. Run: easyserver setup');
  };

  switch (cmd) {
    case '__run-script': {
      // Lets the compiled CLI run plugin scripts ("@node" in manifests) without Node installed.
      const file = args[0];
      if (!file) throw new Error('missing script');
      process.argv = [process.argv[0], file, ...args.slice(1)];
      await import(pathToFileURL(file).href);
      return;
    }
    case 'setup': {
      if (agent.isSetUp() && (await agent.hasMembers())) {
        console.log(`This computer is already set up as "${agent.name}". Use \`easyserver pair\` to add another client.`);
        return;
      }
      let name = args[args.indexOf('--name') + 1];
      if (!args.includes('--name') || !name) {
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        name = (await rl.question(`${bold('Name this server')} ${dim(`(${agent.name ?? 'e.g. Living Room Mac'})`)}: `)).trim() || agent.name || '';
        rl.close();
      }
      const code = await agent.setup(name);
      await waitForClient(agent, code);
      console.log(`  Run ${bold('easyserver start')} to bring it online, or ${bold('easyserver service install')} to start it automatically.\n`);
      return;
    }
    case 'start':
      needSetup();
      if (!(await agent.hasMembers())) {
        console.log('No client has paired with this server yet. Pair one first:');
        await waitForClient(agent, await agent.newPairingCode());
      }
      return runForeground(agent);
    case 'pair':
      needSetup();
      return waitForClient(agent, await agent.newPairingCode());
    case 'status': {
      needSetup();
      await agent.connect();
      const { data: s } = await agent.sb.from('servers').select('*').eq('id', agent.serverId).single();
      const { data: plugins } = await agent.sb.from('installed_plugins').select('plugin_id,name,version,status,status_detail').eq('server_id', agent.serverId);
      console.log(`\n${bold(s?.name ?? agent.name ?? '')}  ${dot(isOnline(s))} ${isOnline(s) ? 'Online' : 'Offline'}`);
      console.log(dim(`ID ${agent.serverId}  ·  key ${await agent.keyFingerprint()}\n`));
      if (!plugins?.length) console.log('No plugins installed. Browse Discover in the client app.\n');
      for (const p of plugins ?? []) {
        console.log(`  ${dot(p.status === 'running')} ${p.name} ${dim(p.version)}  ${p.status}${p.status_detail ? dim(' — ' + p.status_detail) : ''}  ${dim(p.plugin_id)}`);
      }
      console.log('');
      return;
    }
    case 'plugin': {
      needSetup();
      const [action, id] = args;
      const map: Record<string, CommandType> = { start: 'plugin.start', stop: 'plugin.stop', restart: 'plugin.restart', uninstall: 'plugin.uninstall' };
      if (!map[action] || !id) throw new Error('Usage: easyserver plugin <start|stop|restart|uninstall> <plugin-id>');
      await queue(agent, map[action], { pluginId: id });
      console.log(`${dot(true)} Done.`);
      return;
    }
    case 'service':
      if (args[0] === 'install') {
        needSetup();
        console.log(installService());
      } else if (args[0] === 'uninstall') console.log(uninstallService());
      else throw new Error('Usage: easyserver service <install|uninstall>');
      return;
    case 'clients': {
      needSetup();
      const list = await agent.members();
      if (!list.length) console.log('No paired clients.');
      for (const m of list) console.log(`  ${m.user_id}  ${dim('paired ' + new Date(m.created_at).toLocaleString())}`);
      return;
    }
    case 'revoke':
      needSetup();
      if (!args[0]) throw new Error('Usage: easyserver revoke <client-id>');
      await agent.connect();
      await agent.revokeMember(args[0]);
      console.log('Removed.');
      return;
    case 'reset': {
      needSetup();
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      const ok = (await rl.question(`Delete "${agent.name}" from EasyServer? Paired clients lose access. Type yes: `)).trim();
      rl.close();
      if (ok !== 'yes') return console.log('Cancelled.');
      await agent.reset();
      console.log('Server removed. Installed plugins are still on disk.');
      return;
    }
    case 'version':
    case '--version':
    case '-v':
      console.log(APP_VERSION);
      return;
    default:
      console.log(HELP);
  }
}

main().then(
  () => {
    if (!['start', '__run-script'].includes(process.argv[2] ?? '')) process.exit(0);
  },
  (e) => {
    console.error(`\x1b[31merror\x1b[0m ${errMsg(e)}`);
    process.exit(1);
  },
);

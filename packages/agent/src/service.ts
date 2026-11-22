import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

/** The command that re-launches this CLI, whether it's a compiled binary or `node cli.js`. */
function selfCommand(): string[] {
  const exe = process.execPath;
  const base = path.basename(exe).toLowerCase();
  if (/^(node|bun)(\.exe)?$/.test(base) && process.argv[1]) return [exe, path.resolve(process.argv[1])];
  return [exe];
}

const LABEL = 'dev.easyserver.agent';

export function installService(): string {
  const cmd = [...selfCommand(), 'start'];
  switch (process.platform) {
    case 'linux': {
      const dir = path.join(os.homedir(), '.config', 'systemd', 'user');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(
        path.join(dir, 'easyserver.service'),
        `[Unit]\nDescription=EasyServer agent\nAfter=network-online.target\nWants=network-online.target\n\n[Service]\nExecStart=${cmd.map((c) => JSON.stringify(c)).join(' ')}\nRestart=always\nRestartSec=5\n\n[Install]\nWantedBy=default.target\n`,
      );
      execFileSync('systemctl', ['--user', 'daemon-reload']);
      execFileSync('systemctl', ['--user', 'enable', '--now', 'easyserver.service']);
      return 'Installed a systemd user service. To keep it running when you are logged out, run: sudo loginctl enable-linger $USER';
    }
    case 'darwin': {
      const file = path.join(os.homedir(), 'Library', 'LaunchAgents', `${LABEL}.plist`);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      const args = cmd.map((c) => `    <string>${c.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</string>`).join('\n');
      fs.writeFileSync(
        file,
        `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0">\n<dict>\n  <key>Label</key><string>${LABEL}</string>\n  <key>ProgramArguments</key>\n  <array>\n${args}\n  </array>\n  <key>RunAtLoad</key><true/>\n  <key>KeepAlive</key><true/>\n  <key>StandardOutPath</key><string>${os.homedir()}/Library/Logs/easyserver.log</string>\n  <key>StandardErrorPath</key><string>${os.homedir()}/Library/Logs/easyserver.log</string>\n</dict>\n</plist>\n`,
      );
      try {
        execFileSync('launchctl', ['unload', file], { stdio: 'ignore' });
      } catch {}
      execFileSync('launchctl', ['load', '-w', file]);
      return `Installed a LaunchAgent. Logs: ~/Library/Logs/easyserver.log`;
    }
    case 'win32': {
      const tr = cmd.map((c) => `"${c}"`).join(' ');
      execFileSync('schtasks', ['/Create', '/TN', 'EasyServer', '/TR', tr, '/SC', 'ONLOGON', '/RL', 'LIMITED', '/F']);
      execFileSync('schtasks', ['/Run', '/TN', 'EasyServer']);
      return 'Installed a scheduled task that starts EasyServer when you sign in.';
    }
    default:
      throw new Error(`Unsupported platform ${process.platform}`);
  }
}

export function uninstallService(): string {
  switch (process.platform) {
    case 'linux':
      try {
        execFileSync('systemctl', ['--user', 'disable', '--now', 'easyserver.service']);
      } catch {}
      fs.rmSync(path.join(os.homedir(), '.config', 'systemd', 'user', 'easyserver.service'), { force: true });
      return 'Removed the systemd user service.';
    case 'darwin': {
      const file = path.join(os.homedir(), 'Library', 'LaunchAgents', `${LABEL}.plist`);
      try {
        execFileSync('launchctl', ['unload', file]);
      } catch {}
      fs.rmSync(file, { force: true });
      return 'Removed the LaunchAgent.';
    }
    case 'win32':
      try {
        execFileSync('schtasks', ['/End', '/TN', 'EasyServer'], { stdio: 'ignore' });
      } catch {}
      execFileSync('schtasks', ['/Delete', '/TN', 'EasyServer', '/F']);
      return 'Removed the scheduled task.';
    default:
      throw new Error(`Unsupported platform ${process.platform}`);
  }
}

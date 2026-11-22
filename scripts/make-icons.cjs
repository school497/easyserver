// Renders the app and tray icons from SVG with Electron itself (no image tooling needed).
// Run: npx electron scripts/make-icons.cjs
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

function appIcon({ top, bottom, glyph, dot }) {
  // macOS icon grid: 824pt body inside a 1024 canvas, with a soft drop shadow.
  const rows = [300, 452, 604]
    .map(
      (y, i) => `
    <rect x="292" y="${y}" width="440" height="120" rx="34" fill="${glyph}" fill-opacity="${0.96 - i * 0.1}"/>
    <circle cx="352" cy="${y + 60}" r="17" fill="${dot}"/>
    <rect x="400" y="${y + 50}" width="150" height="20" rx="10" fill="${top}" fill-opacity=".55"/>`,
    )
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bottom}"/></linearGradient>
    <linearGradient id="h" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".22"/><stop offset=".45" stop-color="#fff" stop-opacity="0"/></linearGradient>
    <filter id="s" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="12" stdDeviation="14" flood-opacity=".28"/></filter>
  </defs>
  <g filter="url(#s)">
    <rect x="100" y="100" width="824" height="824" rx="186" fill="url(#g)"/>
    <rect x="100" y="100" width="824" height="824" rx="186" fill="url(#h)"/>
  </g>${rows}
</svg>`;
}

const trayGlyph = (color) => `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
  ${[5, 13, 21].map((y) => `<rect x="4" y="${y}" width="24" height="6" rx="2" fill="${color}"/><circle cx="8" cy="${y + 3}" r="1.3" fill="#000" fill-opacity="0"/>`).join('')}
</svg>`;

const jobs = [
  { file: 'apps/client/build/icon.png', size: 1024, svg: appIcon({ top: '#4AA3FF', bottom: '#0060DF', glyph: '#FFFFFF', dot: '#34C759' }) },
  { file: 'apps/server/build/icon.png', size: 1024, svg: appIcon({ top: '#5A5A60', bottom: '#1C1C1E', glyph: '#F2F2F7', dot: '#30D158' }) },
  { file: 'apps/server/build/trayTemplate.png', size: 16, svg: trayGlyph('#000') },
  { file: 'apps/server/build/trayTemplate@2x.png', size: 32, svg: trayGlyph('#000') },
  { file: 'apps/server/build/tray.png', size: 32, svg: trayGlyph('#7A7A80') },
];

app.on('window-all-closed', () => {});
app.whenReady().then(async () => {
  for (const j of jobs) {
    const win = new BrowserWindow({ width: j.size, height: j.size, show: false, transparent: true, frame: false, useContentSize: true, webPreferences: { offscreen: true } });
    const html = `<html><body style="margin:0;background:transparent;overflow:hidden">${j.svg.replace('<svg ', `<svg style="width:${j.size}px;height:${j.size}px;display:block" `)}</body></html>`;
    const tmp = path.join(app.getPath('temp'), `es-icon-${Date.now()}.html`);
    fs.writeFileSync(tmp, html);
    await win.loadFile(tmp);
    fs.rmSync(tmp, { force: true });
    await new Promise((r) => setTimeout(r, 150));
    const img = await win.webContents.capturePage({ x: 0, y: 0, width: j.size, height: j.size });
    const out = path.join(root, j.file);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, img.resize({ width: j.size, height: j.size }).toPNG());
    fs.writeFileSync(out.replace(/\.png$/, '.svg'), j.svg);
    console.log('wrote', j.file);
    win.destroy();
  }
  app.quit();
});

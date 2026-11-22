// Renders the app and tray icons from SVG with Electron itself (no image tooling needed).
// Run: npx electron scripts/make-icons.cjs
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

function appIcon({ top, bottom, glyph, dot }) {
  // macOS icon grid: 824pt body inside a 1024 canvas. Three rack-mounted server units with
  // brushed fronts, drive bays, a vent grille and glowing status lights, between two rack rails.
  const unit = (y, i) => `
    <g filter="url(#u)">
      <rect x="276" y="${y}" width="472" height="124" rx="26" fill="url(#face)"/>
      <rect x="276" y="${y}" width="472" height="124" rx="26" fill="none" stroke="#fff" stroke-opacity=".75" stroke-width="3"/>
      <rect x="279" y="${y + 3}" width="466" height="40" rx="22" fill="#fff" opacity=".35"/>
    </g>
    <circle cx="330" cy="${y + 62}" r="30" fill="url(#halo)"/>
    <circle cx="330" cy="${y + 62}" r="13" fill="${dot}"/>
    <circle cx="326" cy="${y + 58}" r="4" fill="#fff" opacity=".8"/>
    <circle cx="372" cy="${y + 62}" r="8" fill="${i === 1 ? '#0A84FF' : '#C7CCD4'}"/>
    ${[0, 1, 2].map((k) => `<rect x="${404 + k * 58}" y="${y + 36}" width="46" height="52" rx="8" fill="url(#bay)"/><rect x="${414 + k * 58}" y="${y + 58}" width="26" height="6" rx="3" fill="#8A93A0"/>`).join('')}
    ${[0, 1, 2, 3, 4, 5].map((k) => `<rect x="${592 + k * 22}" y="${y + 34}" width="9" height="56" rx="4.5" fill="#7C8592" opacity=".55"/>`).join('')}`;
  const rails = [232, 768]
    .map((x) => `<rect x="${x}" y="268" width="24" height="488" rx="10" fill="url(#rail)"/>${[300, 430, 560, 690].map((y) => `<circle cx="${x + 12}" cy="${y}" r="6" fill="#5B6370"/>`).join('')}`)
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bottom}"/></linearGradient>
    <linearGradient id="h" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".24"/><stop offset=".45" stop-color="#fff" stop-opacity="0"/></linearGradient>
    <linearGradient id="face" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${glyph}"/><stop offset="1" stop-color="#C9D0DA"/></linearGradient>
    <linearGradient id="bay" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#AEB6C2"/><stop offset="1" stop-color="#E6EAF0"/></linearGradient>
    <linearGradient id="rail" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#9AA3AF"/><stop offset=".5" stop-color="#E9EDF2"/><stop offset="1" stop-color="#8A93A0"/></linearGradient>
    <radialGradient id="halo"><stop offset="0" stop-color="${dot}" stop-opacity=".55"/><stop offset="1" stop-color="${dot}" stop-opacity="0"/></radialGradient>
    <filter id="s" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="12" stdDeviation="14" flood-opacity=".28"/></filter>
    <filter id="u" x="-10%" y="-30%" width="120%" height="160%"><feDropShadow dx="0" dy="8" stdDeviation="8" flood-opacity=".3"/></filter>
  </defs>
  <g filter="url(#s)">
    <rect x="100" y="100" width="824" height="824" rx="186" fill="url(#g)"/>
    <rect x="100" y="100" width="824" height="824" rx="186" fill="url(#h)"/>
  </g>
  ${rails}
  ${[290, 450, 610].map(unit).join('')}
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

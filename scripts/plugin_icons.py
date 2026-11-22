"""Detailed plugin icons (256×256 SVG, macOS-style rounded square with depth and lighting).
Imported by make-plugins.py; run directly to also write the Apache icon:  python scripts/plugin_icons.py
"""
import math, os, random

R = 57  # corner radius on a 256 canvas


def tile(bg, body, defs='', sheen=0.22, edge='rgba(0,0,0,0.10)', angle=(0, 0, 0, 1)):
    stops = ''.join(f'<stop offset="{o}" stop-color="{c}"/>' for o, c in bg)
    x1, y1, x2, y2 = angle
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256">
  <defs>
    <linearGradient id="bg" x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}">{stops}</linearGradient>
    <linearGradient id="sheen" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="{sheen}"/><stop offset=".55" stop-color="#fff" stop-opacity="0"/></linearGradient>
    <filter id="drop" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="5" stdDeviation="6" flood-color="#000" flood-opacity=".28"/></filter>
    <filter id="soft" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="2" stdDeviation="2.5" flood-color="#000" flood-opacity=".22"/></filter>
    {defs}
  </defs>
  <rect width="256" height="256" rx="{R}" fill="url(#bg)"/>
  {body}
  <rect width="256" height="256" rx="{R}" fill="url(#sheen)"/>
  <rect x=".75" y=".75" width="254.5" height="254.5" rx="{R - 0.75}" fill="none" stroke="{edge}" stroke-width="1.5"/>
</svg>
'''


def lg(id_, stops, x1=0, y1=0, x2=0, y2=1):
    s = ''.join(f'<stop offset="{o}" stop-color="{c}"/>' for o, c in stops)
    return f'<linearGradient id="{id_}" x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}">{s}</linearGradient>'


def rg(id_, stops, cx=.5, cy=.5, r=.5):
    s = ''.join(f'<stop offset="{o}" stop-color="{c}"/>' for o, c in stops)
    return f'<radialGradient id="{id_}" cx="{cx}" cy="{cy}" r="{r}">{s}</radialGradient>'


ICONS = {}

# ───── Docker: a whale carrying a stack of shipping containers ─────
boxes = []
for row, (y, xs) in enumerate([(114, [74, 100, 126, 152]), (92, [100, 126, 152]), (70, [126])]):
    for x in xs:
        boxes.append(f'<rect x="{x}" y="{y}" width="22" height="20" rx="2.5" fill="url(#box)" stroke="#1557C0" stroke-width="2"/>'
                     f'<path d="M{x+6} {y+4}v12M{x+11} {y+4}v12M{x+16} {y+4}v12" stroke="#1D63ED" stroke-opacity=".35" stroke-width="2"/>')
ICONS['docker'] = tile(
    [(0, '#4FB3FF'), (1, '#1D63ED')],
    f'''<g filter="url(#drop)">
    <path d="M34 134h174c6-14 14-22 24-22-2 8-6 13-11 16 7 1 11 4 13 9-9 2-16 1-22-2-14 48-58 74-114 74-40 0-70-20-72-58 0-9 3-17 8-17z" fill="url(#whale)"/>
    <path d="M44 150c10 30 40 46 76 46 40 0 74-18 92-50" fill="none" stroke="#B9DCFF" stroke-width="5" stroke-linecap="round" opacity=".7"/>
    {''.join(boxes)}
    <circle cx="72" cy="160" r="6" fill="#0B3E91"/><circle cx="74" cy="158" r="2" fill="#fff"/>
  </g>
  <path d="M28 214c22-8 44-8 66 0s44 8 66 0 44-8 66 0" fill="none" stroke="#fff" stroke-opacity=".35" stroke-width="5" stroke-linecap="round"/>''',
    defs=lg('whale', [(0, '#FFFFFF'), (1, '#DCEBFF')]) + lg('box', [(0, '#FFFFFF'), (1, '#CFE3FF')]),
)

# ───── Kubernetes: seven-spoke ship's wheel ─────
cx = cy = 128
hept = ' '.join(f'{cx + 86 * math.cos(math.radians(-90 + i * 360 / 7)):.1f},{cy + 86 * math.sin(math.radians(-90 + i * 360 / 7)):.1f}' for i in range(7))
spokes, knobs = [], []
for i in range(7):
    a = math.radians(-90 + i * 360 / 7)
    x1, y1 = cx + 22 * math.cos(a), cy + 22 * math.sin(a)
    x2, y2 = cx + 62 * math.cos(a), cy + 62 * math.sin(a)
    spokes.append(f'<path d="M{x1:.1f} {y1:.1f}L{x2:.1f} {y2:.1f}"/>')
    knobs.append(f'<circle cx="{cx + 62 * math.cos(a):.1f}" cy="{cy + 62 * math.sin(a):.1f}" r="7" fill="#fff"/>')
ICONS['kubernetes'] = tile(
    [(0, '#5E8BF7'), (1, '#2347B8')],
    f'''<g filter="url(#drop)">
    <polygon points="{hept}" fill="url(#hept)" stroke="#fff" stroke-width="6" stroke-linejoin="round"/>
    <circle cx="128" cy="128" r="62" fill="none" stroke="#fff" stroke-width="10"/>
    <g stroke="#fff" stroke-width="10" stroke-linecap="round">{''.join(spokes)}</g>
    {''.join(knobs)}
    <circle cx="128" cy="128" r="24" fill="#fff"/><circle cx="128" cy="128" r="11" fill="#2F5BD8"/>
  </g>''',
    defs=lg('hept', [(0, '#4A78EE'), (1, '#2A4FC2')]),
)

# ───── Minecraft: an isometric grass block, pixel textured ─────
rnd = random.Random(7)


def face(matrix, palette, top_rows=None):
    out = []
    for y in range(8):
        for x in range(8):
            pal = top_rows(y) if top_rows else palette
            out.append(f'<rect x="{x}" y="{y}" width="1.04" height="1.04" fill="{rnd.choice(pal)}"/>')
    return f'<g transform="matrix({matrix})">{"".join(out)}</g>'


GRASS = ['#6FBF3A', '#5BAA2E', '#7DCB44', '#4F9A27', '#66B535']
DIRT = ['#8B5A2B', '#7A4E24', '#9A6634', '#6C4420', '#86552A']
s = 11  # pixel size
top = face(f'{s} {s * 0.5} {-s} {s * 0.5} 128 40', GRASS)
left = face(f'{s} {s * 0.5} 0 {s} 40 84', None, lambda y: GRASS if y < 2 else (GRASS + DIRT if y == 2 else DIRT))
right = face(f'{s} {-s * 0.5} 0 {s} 128 128', None, lambda y: GRASS if y < 2 else (GRASS + DIRT if y == 2 else DIRT))
ICONS['minecraft'] = tile(
    [(0, '#8FD3FF'), (1, '#4A9FE0')],
    f'''<g filter="url(#drop)">{top}{left}<g opacity=".78">{right}</g>
    <path d="M128 40l88 44v88l-88 44-88-44V84z" fill="none" stroke="#000" stroke-opacity=".25" stroke-width="2"/>
    <path d="M40 84l88 44 88-44M128 128v88" fill="none" stroke="#000" stroke-opacity=".18" stroke-width="2"/></g>
  <rect x="40" y="84" width="88" height="132" fill="#000" opacity="0"/>''',
)

# ───── Ollama: a friendly llama ─────
ICONS['ollama'] = tile(
    [(0, '#FFFFFF'), (1, '#E6E6EA')],
    '''<g filter="url(#soft)" fill="#fff" stroke="#1C1C1E" stroke-width="7" stroke-linejoin="round" stroke-linecap="round">
    <path d="M88 96c-6-30-4-52 6-60 10 8 14 30 12 54"/>
    <path d="M168 96c6-30 4-52-6-60-10 8-14 30-12 54"/>
    <path d="M70 150c0-40 26-66 58-66s58 26 58 66c0 18-6 30-14 40v34H84v-34c-8-10-14-22-14-40z"/>
    <path d="M100 168c0-14 12-22 28-22s28 8 28 22-12 24-28 24-28-10-28-24z" fill="#F4F4F6"/>
  </g>
  <circle cx="104" cy="132" r="7" fill="#1C1C1E"/><circle cx="152" cy="132" r="7" fill="#1C1C1E"/>
  <circle cx="106" cy="130" r="2.2" fill="#fff"/><circle cx="154" cy="130" r="2.2" fill="#fff"/>
  <path d="M120 164c3 3 13 3 16 0" fill="none" stroke="#1C1C1E" stroke-width="5" stroke-linecap="round"/>
  <path d="M128 168v8" stroke="#1C1C1E" stroke-width="5" stroke-linecap="round"/>
  <ellipse cx="94" cy="154" rx="8" ry="5" fill="#FF9DB0" opacity=".55"/><ellipse cx="162" cy="154" rx="8" ry="5" fill="#FF9DB0" opacity=".55"/>''',
    sheen=0.35, edge='rgba(0,0,0,0.12)',
)

# ───── Plex-style media server: a bold golden chevron ─────
ICONS['plex'] = tile(
    [(0, '#3A3A3C'), (1, '#121214')],
    '''<g filter="url(#drop)">
    <path d="M86 50h52l60 78-60 78H86l60-78z" fill="url(#chev)"/>
    <path d="M86 50h52l60 78h-52z" fill="#fff" opacity=".18"/>
  </g>''',
    defs=lg('chev', [(0, '#FFD34E'), (.5, '#F5B300'), (1, '#E08E00')]),
)

# ───── Jellyfin-style media server: luminous gradient arches ─────
ICONS['jellyfin'] = tile(
    [(0, '#1B2340'), (1, '#0A0E1F')],
    '''<g filter="url(#drop)">
    <path d="M128 44c-14 0-76 108-70 124 6 18 128 18 140 0 8-16-56-124-70-124z" fill="url(#jf)"/>
    <path d="M128 92c-7 0-38 54-35 62 3 9 64 9 70 0 4-8-28-62-35-62z" fill="#0F1530"/>
    <path d="M128 112c-3 0-17 25-16 29 1 4 30 4 32 0 2-4-13-29-16-29z" fill="url(#jf)"/>
  </g>''',
    defs=lg('jf', [(0, '#B65BD8'), (1, '#18A9E0')], 0, 0, 1, 1),
)

# ───── Cloudflare Tunnel: an orange cloud over a tunnel ─────
ICONS['cloudflare-tunnel'] = tile(
    [(0, '#FFFFFF'), (1, '#EDEDF0')],
    '''<g filter="url(#drop)">
    <path d="M66 176a34 34 0 0 1 10-66 50 50 0 0 1 94-12 40 40 0 0 1 48 38 26 26 0 0 1-4 40z" fill="url(#cfb)"/>
    <path d="M52 176a30 30 0 0 1 14-56 46 46 0 0 1 86-6 36 36 0 0 1 40 46 22 22 0 0 1 0 16z" fill="url(#cff)"/>
    <path d="M70 160h108" stroke="#fff" stroke-opacity=".55" stroke-width="6" stroke-linecap="round"/>
  </g>
  <path d="M80 214a48 30 0 0 1 96 0" fill="none" stroke="#F38020" stroke-width="10" stroke-linecap="round" opacity=".85"/>
  <path d="M104 214a24 16 0 0 1 48 0" fill="none" stroke="#F38020" stroke-width="8" stroke-linecap="round" opacity=".55"/>''',
    defs=lg('cff', [(0, '#FBA94C'), (1, '#F07814')]) + lg('cfb', [(0, '#FCC57C'), (1, '#F9A23C')]),
    sheen=0.35,
)

# ───── Bulk File Converter: a photo turning into another format ─────
ICONS['converter'] = tile(
    [(0, '#FFB340'), (1, '#F06A00')],
    '''<g filter="url(#drop)">
    <g transform="rotate(-8 92 120)">
      <path d="M52 64h62l22 22v86a8 8 0 0 1-8 8H52a8 8 0 0 1-8-8V72a8 8 0 0 1 8-8z" fill="#fff"/>
      <path d="M114 64v22h22" fill="#E8E8ED"/>
      <rect x="56" y="96" width="68" height="50" rx="6" fill="url(#sky)"/>
      <path d="M56 140l20-22 16 14 10-10 22 22v2a6 6 0 0 1-6 6H62a6 6 0 0 1-6-6z" fill="#34C759"/>
      <circle cx="108" cy="110" r="7" fill="#FFD60A"/>
      <rect x="56" y="154" width="44" height="8" rx="4" fill="#D1D1D6"/>
    </g>
    <g transform="rotate(8 166 140)">
      <path d="M128 84h62l22 22v86a8 8 0 0 1-8 8h-76a8 8 0 0 1-8-8V92a8 8 0 0 1 8-8z" fill="#fff"/>
      <path d="M190 84v22h22" fill="#E8E8ED"/>
      <rect x="134" y="118" width="70" height="30" rx="8" fill="#0A84FF"/>
      <text x="169" y="140" font-family="-apple-system, Helvetica, Arial, sans-serif" font-weight="800" font-size="20" fill="#fff" text-anchor="middle">WEBP</text>
      <rect x="134" y="160" width="52" height="8" rx="4" fill="#D1D1D6"/><rect x="134" y="174" width="36" height="8" rx="4" fill="#D1D1D6"/>
    </g>
  </g>
  <g fill="none" stroke="#fff" stroke-width="9" stroke-linecap="round" stroke-linejoin="round" filter="url(#soft)">
    <path d="M100 210c20 16 52 16 70 0"/><path d="M158 200l12 10-14 8"/>
  </g>''',
    defs=lg('sky', [(0, '#64D2FF'), (1, '#0A84FF')]),
)

# ───── Cloud Storage: a glossy cloud drive ─────
ICONS['cloud-storage'] = tile(
    [(0, '#7FD3FF'), (1, '#1E7CF2')],
    '''<g filter="url(#drop)">
    <path d="M70 186a40 40 0 0 1-4-80 58 58 0 0 1 110-14 44 44 0 0 1 14 94z" fill="url(#cl)"/>
    <path d="M86 112a50 50 0 0 1 86-18" fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round" opacity=".9"/>
    <rect x="94" y="138" width="68" height="30" rx="9" fill="url(#drive)"/>
    <circle cx="146" cy="153" r="4.5" fill="#30D158"/><path d="M106 153h22" stroke="#9FB3C8" stroke-width="5" stroke-linecap="round"/>
  </g>''',
    defs=lg('cl', [(0, '#FFFFFF'), (1, '#DCEBFA')]) + lg('drive', [(0, '#5B6B7F'), (1, '#36414F')]),
)

# ───── Xcode Builds: a hammer over a blueprint ─────
grid = ''.join(f'<path d="M{x} 0V256" />' for x in range(16, 256, 16)) + ''.join(f'<path d="M0 {y}H256" />' for y in range(16, 256, 16))
ICONS['xcode'] = tile(
    [(0, '#2F7DE1'), (1, '#1552A8')],
    f'''<g stroke="#fff" stroke-opacity=".10" stroke-width="1">{grid}</g>
  <g fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="3"><circle cx="128" cy="128" r="70"/><path d="M58 128h140M128 58v140"/></g>
  <g filter="url(#drop)" transform="rotate(-40 128 128)">
    <rect x="118" y="96" width="20" height="128" rx="8" fill="url(#handle)"/>
    <rect x="120" y="190" width="16" height="30" rx="6" fill="#1C1C1E" opacity=".35"/>
    <path d="M70 66h104l14 16v20h-30l-6-8h-58l-24 8z" fill="url(#head)"/>
    <path d="M70 66h104l14 16H70z" fill="#fff" opacity=".35"/>
  </g>''',
    defs=lg('handle', [(0, '#5AC8FA'), (1, '#0A84FF')], 0, 0, 1, 0) + lg('head', [(0, '#F2F2F7'), (.5, '#AEAEB2'), (1, '#6E6E73')]),
)

# ───── Remote Control: a display with a remote cursor ─────
ICONS['remote-control'] = tile(
    [(0, '#4CD964'), (1, '#16A34A')],
    '''<g filter="url(#drop)">
    <rect x="38" y="52" width="180" height="124" rx="14" fill="url(#bezel)"/>
    <rect x="48" y="62" width="160" height="104" rx="6" fill="url(#screen)"/>
    <path d="M48 140c30-22 60-6 90-18s50-6 70 4v34a6 6 0 0 1-6 6H54a6 6 0 0 1-6-6z" fill="#fff" opacity=".22"/>
    <path d="M110 176h36l8 26h-52z" fill="url(#stand)"/>
    <rect x="86" y="200" width="84" height="10" rx="5" fill="#E5E5EA"/>
    <path d="M140 90l42 18-18 6-6 18z" fill="#fff" stroke="#1C1C1E" stroke-width="4" stroke-linejoin="round"/>
  </g>
  <g fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round" opacity=".9"><path d="M188 40a24 24 0 0 1 24 24"/><path d="M188 26a38 38 0 0 1 38 38"/></g>''',
    defs=lg('bezel', [(0, '#3A3A3C'), (1, '#1C1C1E')]) + lg('screen', [(0, '#5E5CE6'), (1, '#0A84FF')], 0, 0, 1, 1) + lg('stand', [(0, '#F2F2F7'), (1, '#AEAEB2')]),
)

# ───── Terminal: a window with a prompt ─────
ICONS['terminal'] = tile(
    [(0, '#4A4A4E'), (1, '#1C1C1E')],
    '''<g filter="url(#drop)">
    <rect x="34" y="48" width="188" height="160" rx="16" fill="#0D0D0F"/>
    <path d="M34 64a16 16 0 0 1 16-16h156a16 16 0 0 1 16 16v14H34z" fill="url(#bar)"/>
    <circle cx="54" cy="63" r="6" fill="#FF5F57"/><circle cx="74" cy="63" r="6" fill="#FEBC2E"/><circle cx="94" cy="63" r="6" fill="#28C840"/>
    <path d="M58 108l26 22-26 22" fill="none" stroke="#30D158" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>
    <rect x="96" y="146" width="48" height="10" rx="3" fill="#F2F2F7"/>
    <rect x="58" y="176" width="110" height="6" rx="3" fill="#636366" opacity=".7"/>
  </g>''',
    defs=lg('bar', [(0, '#5A5A5E'), (1, '#3A3A3C')]),
)

# ───── Apache web server: a sweeping multicolour feather ─────
ICONS['apache'] = tile(
    [(0, '#FFFFFF'), (1, '#ECECF0')],
    '''<g filter="url(#drop)">
    <path d="M196 34c-46 6-92 46-112 104-8 24-12 50-12 70l16-6c4-22 10-42 18-58 16-34 46-74 90-110z" fill="url(#feather)"/>
    <path d="M196 34c-30 30-54 64-70 100-10 22-18 46-22 68" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity=".7"/>
    <path d="M88 202c-8 14-14 22-20 26" fill="none" stroke="#8E8E93" stroke-width="6" stroke-linecap="round"/>
    <g stroke="#fff" stroke-width="2.5" opacity=".55" fill="none"><path d="M120 140l-22-4M134 112l-24-6M150 86l-22-8M168 62l-20-8"/></g>
  </g>''',
    defs=lg('feather', [(0, '#6E3CBC'), (.3, '#D22128'), (.62, '#F37021'), (1, '#FBB040')], 1, 0, 0, 1),
    sheen=0.35,
)


if __name__ == '__main__':
    root = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'plugins')
    with open(os.path.join(root, 'apache', 'icon.svg'), 'w', encoding='utf8') as f:
        f.write(ICONS['apache'])
    print('wrote apache icon;', len(ICONS), 'icons defined')

"""Writes the manifests and icons for the bundled EasyServer plugins and copies shared scripts.
Run from the repo root: python scripts/make-plugins.py
Each plugins/<slug>/ folder is self-contained: push it to GitHub and list its URL in plugin_sources.
"""
import json, os, shutil, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from plugin_icons import ICONS

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'plugins')
WINGET = '{{env.LOCALAPPDATA}}/Microsoft/WinGet/Links'
ALL = ['darwin', 'linux', 'win32']


def winget(pkg):
    return f'winget install --id {pkg} -e --silent --accept-package-agreements --accept-source-agreements --disable-interactivity'


def linux_pkg(apt, dnf=None, pacman=None):
    dnf = dnf or apt
    pacman = pacman or apt
    return (f'if command -v apt-get >/dev/null; then sudo -n apt-get install -y {apt}; '
            f'elif command -v dnf >/dev/null; then sudo -n dnf install -y {dnf}; '
            f'elif command -v pacman >/dev/null; then sudo -n pacman -S --noconfirm {pacman}; '
            f'else echo "No supported package manager found"; exit 1; fi')


def node(script, *args):
    return {'command': '@node', 'args': ['{{pluginDir}}/scripts/' + script, *args]}


def dl(url, dest):
    return node('download.mjs', url, dest)


ARCH = '{{#if isArm}}arm64{{/if}}{{#if isX64}}amd64{{/if}}'


def icon(c1, c2, glyph, fill=''):
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{c1}"/><stop offset="1" stop-color="{c2}"/></linearGradient>
    <linearGradient id="hl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".24"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/></linearGradient>
  </defs>
  <rect width="256" height="256" rx="56" fill="url(#bg)"/>
  <rect width="256" height="256" rx="56" fill="url(#hl)"/>
  <g fill="none" stroke="#fff" stroke-width="11" stroke-linecap="round" stroke-linejoin="round">{glyph}</g>{fill}
</svg>
'''


PORT = lambda key, default, label='Port', **kw: {'key': key, 'label': label, 'type': 'port', 'default': default, 'min': 1024, **kw}
LISTEN = lambda default='local', group='Network': {
    'key': 'listen', 'label': 'Who Can Connect', 'type': 'select', 'default': default, 'group': group,
    'options': [{'label': 'Only This Computer', 'value': 'local'}, {'label': 'Anyone on My Network', 'value': 'all'}],
}
BIND = '{{#if settings.listen=all}}0.0.0.0{{/if}}{{#if settings.listen=local}}127.0.0.1{{/if}}'
PASSWORD = lambda **kw: {'key': 'password', 'label': 'Password', 'type': 'password', 'default': '', 'required': True,
                         'pattern': '^.{8,}$', 'patternHint': 'At least 8 characters.', **kw}

PLUGINS = []

# ───────────────────────────── Bulk File Converter ─────────────────────────────
PLUGINS.append(dict(
    slug='converter',
    icon=icon('#FF9F0A', '#E35D00', '<path d="M70 112a60 60 0 0 1 104-36"/><path d="M186 144a60 60 0 0 1-104 36"/><path d="M176 50v30h-30"/><path d="M80 206v-30h30"/>'),
    scripts=['converter.mjs'],
    manifest={
        'id': 'dev.easyserver.converter', 'name': 'Bulk File Converter', 'subtitle': 'Drop files in, get converted files out',
        'category': 'computing', 'platforms': ALL,
        'description': 'Converts every file you put in Inbox: photos to WebP, JPEG, PNG or AVIF, audio to MP3, AAC, FLAC, Ogg or WAV, and video to MP4, WebM, MKV, MOV or animated GIF. Documents can become PDFs too.\n\n'
                       'Upload files or whole folders to Inbox from the app. Converted files keep their folder structure in Converted, ready to download. Originals move to Originals, and anything that fails lands in Failed with the reason in the log.\n\n'
                       'Uses FFmpeg, installed automatically. Turning on Documents to PDF needs LibreOffice.',
        'requires': [{
            'id': 'ffmpeg', 'label': 'FFmpeg',
            'candidates': {
                'darwin': [{'path': '/opt/homebrew/bin/ffmpeg'}, {'path': '/usr/local/bin/ffmpeg'}, {'path': '@path:ffmpeg'}],
                'linux': [{'path': '/usr/bin/ffmpeg'}, {'path': '/usr/local/bin/ffmpeg'}, {'path': '@path:ffmpeg'}],
                'win32': [{'path': f'{WINGET}/ffmpeg.exe'}, {'path': 'C:/ffmpeg/bin/ffmpeg.exe'}, {'path': '@path:ffmpeg'}],
            },
            'install': {'darwin': ['brew install ffmpeg'], 'linux': [linux_pkg('ffmpeg')], 'win32': [winget('Gyan.FFmpeg')]},
            'hint': 'Install FFmpeg (macOS: brew install ffmpeg · Linux: sudo apt install ffmpeg · Windows: winget install Gyan.FFmpeg).',
        }],
        'settings': [
            {'key': 'imageFormat', 'label': 'Convert Images To', 'type': 'select', 'default': 'webp', 'group': 'Images',
             'options': [{'label': 'WebP', 'value': 'webp'}, {'label': 'JPEG', 'value': 'jpg'}, {'label': 'PNG', 'value': 'png'}, {'label': 'AVIF', 'value': 'avif'}]},
            {'key': 'imageQuality', 'label': 'Image Quality', 'type': 'slider', 'default': 85, 'min': 10, 'max': 100, 'step': 5, 'unit': '%', 'group': 'Images', 'restart': True},
            {'key': 'maxWidth', 'label': 'Maximum Width', 'type': 'number', 'default': 0, 'min': 0, 'max': 20000, 'unit': 'px', 'group': 'Images', 'description': '0 keeps the original size. Larger images shrink to this width.'},
            {'key': 'stripMetadata', 'label': 'Remove Location and Camera Data', 'type': 'boolean', 'default': True, 'group': 'Images'},
            {'key': 'audioFormat', 'label': 'Convert Audio To', 'type': 'select', 'default': 'mp3', 'group': 'Audio',
             'options': [{'label': 'MP3', 'value': 'mp3'}, {'label': 'AAC', 'value': 'm4a'}, {'label': 'FLAC', 'value': 'flac'}, {'label': 'Ogg', 'value': 'ogg'}, {'label': 'WAV', 'value': 'wav'}]},
            {'key': 'audioBitrate', 'label': 'Audio Bitrate', 'type': 'select', 'default': '192k', 'group': 'Audio',
             'options': [{'label': '128 kbps', 'value': '128k'}, {'label': '192 kbps', 'value': '192k'}, {'label': '256 kbps', 'value': '256k'}, {'label': '320 kbps', 'value': '320k'}],
             'visibleIf': None},
            {'key': 'videoFormat', 'label': 'Convert Video To', 'type': 'select', 'default': 'mp4', 'group': 'Video',
             'options': [{'label': 'MP4', 'value': 'mp4'}, {'label': 'WebM', 'value': 'webm'}, {'label': 'MKV', 'value': 'mkv'}, {'label': 'MOV', 'value': 'mov'}, {'label': 'GIF', 'value': 'gif'}]},
            {'key': 'videoQuality', 'label': 'Video Quality', 'type': 'slider', 'default': 23, 'min': 16, 'max': 36, 'unit': 'CRF', 'group': 'Video', 'description': 'Lower is sharper and larger. 18–28 suits most videos.'},
            {'key': 'maxHeight', 'label': 'Maximum Resolution', 'type': 'select', 'default': 'keep', 'group': 'Video',
             'options': [{'label': 'Original', 'value': 'keep'}, {'label': '4K', 'value': '2160'}, {'label': '1080p', 'value': '1080'}, {'label': '720p', 'value': '720'}, {'label': '480p', 'value': '480'}]},
            {'key': 'speed', 'label': 'Encoding Speed', 'type': 'select', 'default': 'medium', 'group': 'Video',
             'options': [{'label': 'Fast', 'value': 'fast'}, {'label': 'Balanced', 'value': 'medium'}, {'label': 'Smallest Files', 'value': 'slow'}]},
            {'key': 'docsToPdf', 'label': 'Documents to PDF', 'type': 'boolean', 'default': False, 'group': 'Documents', 'description': 'Word, Excel, PowerPoint and OpenDocument files. Needs LibreOffice on the server.'},
            {'key': 'concurrency', 'label': 'Files at Once', 'type': 'slider', 'default': 2, 'min': 1, 'max': 8, 'group': 'Processing'},
            {'key': 'keepOriginals', 'label': 'Keep Originals', 'type': 'boolean', 'default': True, 'group': 'Processing', 'description': 'Off deletes each original after it converts.'},
            {'key': 'scanSeconds', 'label': 'Check Inbox Every', 'type': 'number', 'default': 5, 'min': 2, 'max': 300, 'unit': 'seconds', 'group': 'Processing'},
        ],
        'run': node('converter.mjs'),
        'actions': [
            {'id': 'retry', 'label': 'Retry Failed Files', 'description': 'Moves everything in Failed back to Inbox.', **node('converter.mjs', 'retry')},
            {'id': 'clear-converted', 'label': 'Empty Converted', 'confirm': 'Delete every file in Converted? This can’t be undone.', 'destructive': True, **node('converter.mjs', 'clear', 'converted')},
            {'id': 'clear-originals', 'label': 'Empty Originals', 'confirm': 'Delete every file in Originals? This can’t be undone.', 'destructive': True, **node('converter.mjs', 'clear', 'originals')},
            {'id': 'version', 'label': 'FFmpeg Version', 'command': '{{bin.ffmpeg}}', 'args': ['-hide_banner', '-version']},
        ],
        'folders': [
            {'id': 'inbox', 'label': 'Inbox', 'root': '{{dataDir}}/inbox', 'description': 'Upload files or folders here. Each one converts a few seconds after it arrives.'},
            {'id': 'converted', 'label': 'Converted', 'root': '{{dataDir}}/converted', 'description': 'Finished files, in the same folders they were uploaded in.'},
            {'id': 'originals', 'label': 'Originals', 'root': '{{dataDir}}/originals'},
            {'id': 'failed', 'label': 'Failed', 'root': '{{dataDir}}/failed', 'description': 'Files that couldn’t be converted. The Output log says why.'},
        ],
    },
))

# ───────────────────────────── Ollama ─────────────────────────────
PLUGINS.append(dict(
    slug='ollama',
    icon=icon('#5E5CE6', '#2C2A9E', '<rect x="78" y="78" width="100" height="100" rx="18"/><path d="M104 78V54M152 78V54M104 202v-24M152 202v-24M78 104H54M78 152H54M202 104h-24M202 152h-24"/><path d="M108 140c8 10 32 10 40 0"/><path d="M110 112h0M146 112h0"/>'),
    scripts=['serve.mjs', 'models.mjs'],
    manifest={
        'id': 'dev.easyserver.ollama', 'name': 'Ollama', 'subtitle': 'Run open AI models on your server',
        'category': 'computing', 'platforms': ALL,
        'description': 'Runs large language models like Llama, Gemma, Qwen and Mistral on this computer with Ollama, and serves them over Ollama’s API to apps on your network.\n\n'
                       'List the models you want in Settings and they download when the plugin starts. Upload a Modelfile to make a custom model with its own system prompt and parameters.\n\n'
                       'If the Ollama desktop app is already running on this computer, quit it first or choose a different port.',
        'requires': [{
            'id': 'ollama', 'label': 'Ollama',
            'candidates': {
                'darwin': [{'path': '/opt/homebrew/bin/ollama'}, {'path': '/usr/local/bin/ollama'}, {'path': '/Applications/Ollama.app/Contents/Resources/ollama'}, {'path': '@path:ollama'}],
                'linux': [{'path': '/usr/local/bin/ollama'}, {'path': '/usr/bin/ollama'}, {'path': '@path:ollama'}],
                'win32': [{'path': '{{env.LOCALAPPDATA}}/Programs/Ollama/ollama.exe'}, {'path': '@path:ollama'}],
            },
            'install': {'darwin': ['brew install ollama'], 'linux': ['curl -fsSL https://ollama.com/install.sh | sudo -n sh'], 'win32': [winget('Ollama.Ollama')]},
            'hint': 'Install Ollama from ollama.com/download.',
        }],
        'settings': [
            PORT('port', 11434, group='Network'),
            LISTEN('local'),
            {'key': 'origins', 'label': 'Allowed Web Origins', 'type': 'list', 'default': [], 'group': 'Network', 'placeholder': 'https://chat.example.com',
             'description': 'Websites allowed to call the API from a browser. Leave empty for apps and scripts.'},
            {'key': 'models', 'label': 'Models', 'type': 'list', 'default': ['llama3.2:3b'], 'group': 'Models', 'placeholder': 'e.g. gemma3:4b',
             'pattern': '^[a-zA-Z0-9][a-zA-Z0-9._/-]*(:[a-zA-Z0-9._-]+)?$', 'patternHint': 'A model name from ollama.com/library, like qwen2.5:7b.', 'restart': False},
            {'key': 'pullOnStart', 'label': 'Download Listed Models on Start', 'type': 'boolean', 'default': True, 'group': 'Models', 'restart': False},
            {'key': 'modelsDir', 'label': 'Model Folder', 'type': 'path', 'default': '', 'group': 'Models', 'placeholder': 'Inside EasyServer',
             'description': 'Leave empty to keep models with this plugin. Point it at an existing folder to reuse models you already have.'},
            {'key': 'contextLength', 'label': 'Context Length', 'type': 'select', 'default': '4096', 'group': 'Performance',
             'options': [{'label': '2K', 'value': '2048'}, {'label': '4K', 'value': '4096'}, {'label': '8K', 'value': '8192'}, {'label': '16K', 'value': '16384'}, {'label': '32K', 'value': '32768'}]},
            {'key': 'keepAlive', 'label': 'Keep Models Loaded', 'type': 'slider', 'default': 5, 'min': 0, 'max': 60, 'unit': 'min', 'group': 'Performance'},
            {'key': 'parallel', 'label': 'Requests at Once', 'type': 'slider', 'default': 1, 'min': 1, 'max': 8, 'group': 'Performance'},
            {'key': 'maxLoaded', 'label': 'Models in Memory', 'type': 'slider', 'default': 1, 'min': 1, 'max': 4, 'group': 'Performance'},
            {'key': 'flashAttention', 'label': 'Flash Attention', 'type': 'boolean', 'default': False, 'group': 'Performance', 'description': 'Uses less memory on supported GPUs.'},
        ],
        'run': {**node('serve.mjs'), 'env': {
            'OLLAMA_HOST': BIND + ':{{settings.port}}',
            'OLLAMA_MODELS': '{{#if settings.modelsDir}}{{settings.modelsDir}}{{/if}}{{#unless settings.modelsDir}}{{dataDir}}/models{{/unless}}',
            'OLLAMA_ORIGINS': '{{settings.origins}}',
            'OLLAMA_KEEP_ALIVE': '{{settings.keepAlive}}m',
            'OLLAMA_NUM_PARALLEL': '{{settings.parallel}}',
            'OLLAMA_MAX_LOADED_MODELS': '{{settings.maxLoaded}}',
            'OLLAMA_CONTEXT_LENGTH': '{{settings.contextLength}}',
            'OLLAMA_FLASH_ATTENTION': '{{#if settings.flashAttention}}1{{/if}}',
        }},
        'health': {'type': 'http', 'target': 'http://127.0.0.1:{{settings.port}}/api/version', 'intervalSec': 30},
        'links': [{'label': 'API Address', 'url': 'http://{{host}}:{{settings.port}}/'}],
        'actions': [
            {'id': 'pull', 'label': 'Download Models', 'description': 'Downloads every model in Settings that isn’t here yet.', 'background': True, **node('models.mjs', 'pull')},
            {'id': 'create', 'label': 'Create Models from Modelfiles', 'background': True, **node('models.mjs', 'create')},
            {'id': 'list', 'label': 'Installed Models', 'command': '{{bin.ollama}}', 'args': ['list']},
            {'id': 'ps', 'label': 'Loaded Models', 'command': '{{bin.ollama}}', 'args': ['ps']},
            {'id': 'prune', 'label': 'Remove Unlisted Models', 'confirm': 'Delete every model that isn’t in Settings or made from a Modelfile?', 'destructive': True, **node('models.mjs', 'prune')},
        ],
        'folders': [{'id': 'modelfiles', 'label': 'Modelfiles', 'root': '{{dataDir}}/modelfiles', 'maxFileMB': 1,
                     'description': 'Each file becomes a model named after it. Run Create Models from Modelfiles after uploading.'}],
    },
))

# ───────────────────────────── Cloud Storage ─────────────────────────────
PLUGINS.append(dict(
    slug='cloud-storage',
    icon=icon('#64D2FF', '#0A7AD6', '<path d="M82 176h96a38 38 0 0 0 2-76 54 54 0 0 0-104 14 32 32 0 0 0 6 62z"/><path d="M128 152v-48M106 124l22-22 22 22"/>'),
    scripts=[],
    manifest={
        'id': 'dev.easyserver.cloudstorage', 'name': 'Cloud Storage', 'subtitle': 'Your own private cloud drive',
        'category': 'storage', 'platforms': ALL,
        'description': 'Turns this computer into a private cloud drive you can open from any Mac, PC or phone on your network.\n\n'
                       'It speaks WebDAV, which Finder (Go › Connect to Server), Windows File Explorer (Map Network Drive) and most file apps support. Files also show up in the app under Files, where you can upload and download them.\n\n'
                       'Turn on Backups to copy everything to Amazon S3, Backblaze B2, Google Drive, OneDrive, Dropbox or another rclone remote.',
        'requires': [{
            'id': 'rclone', 'label': 'rclone',
            'candidates': {
                'darwin': [{'path': '/opt/homebrew/bin/rclone'}, {'path': '/usr/local/bin/rclone'}, {'path': '@path:rclone'}],
                'linux': [{'path': '/usr/bin/rclone'}, {'path': '/usr/local/bin/rclone'}, {'path': '@path:rclone'}],
                'win32': [{'path': f'{WINGET}/rclone.exe'}, {'path': '@path:rclone'}],
            },
            'install': {'darwin': ['brew install rclone'], 'linux': [linux_pkg('rclone')], 'win32': [winget('Rclone.Rclone')]},
            'hint': 'Install rclone from rclone.org/install.',
        }],
        'settings': [
            PORT('port', 8090, group='Network'),
            LISTEN('all'),
            {'key': 'username', 'label': 'Username', 'type': 'string', 'default': 'easyserver', 'required': True, 'group': 'Sign In', 'pattern': '^[A-Za-z0-9._-]+$', 'patternHint': 'Letters, numbers, dots, dashes and underscores.'},
            PASSWORD(group='Sign In'),
            {'key': 'readOnly', 'label': 'Read Only', 'type': 'boolean', 'default': False, 'group': 'Sign In', 'description': 'People can open and download files but not change them.'},
            {'key': 'cacheMode', 'label': 'Write Cache', 'type': 'select', 'default': 'writes', 'group': 'Advanced',
             'options': [{'label': 'Off', 'value': 'off'}, {'label': 'Writes', 'value': 'writes'}, {'label': 'Full', 'value': 'full'}],
             'description': 'Writes is the most compatible with Finder and File Explorer.'},
            {'key': 'backupEnabled', 'label': 'Back Up to Another Cloud', 'type': 'boolean', 'default': False, 'group': 'Backups', 'restart': False},
            {'key': 'backupRemote', 'label': 'Backup Destination', 'type': 'string', 'default': '', 'group': 'Backups', 'placeholder': 'mys3:my-bucket/easyserver',
             'visibleIf': {'key': 'backupEnabled', 'equals': True}, 'restart': False, 'description': 'A remote from the configuration below, a colon, then a path.'},
            {'key': 'backupConfig', 'label': 'rclone Configuration', 'type': 'text', 'default': '[mys3]\ntype = s3\nprovider = AWS\naccess_key_id = \nsecret_access_key = \nregion = us-east-1\n', 'rows': 8,
             'group': 'Backups', 'visibleIf': {'key': 'backupEnabled', 'equals': True}, 'restart': False,
             'description': 'Paste the output of “rclone config show” from a computer where you set the remote up.'},
        ],
        'templates': [{'src': 'templates/rclone.conf', 'dest': 'rclone.conf'}],
        'run': {'command': '{{bin.rclone}}', 'args': [
            'serve', 'webdav', '{{dataDir}}/storage',
            '--addr', BIND + ':{{settings.port}}',
            '--user', '{{settings.username}}', '--pass', '{{settings.password}}',
            '--vfs-cache-mode', '{{settings.cacheMode}}', '--cache-dir', '{{dataDir}}/cache',
            '{{#if settings.readOnly}}--read-only{{/if}}',
            '--config', '{{runtimeDir}}/rclone.conf',
        ]},
        'health': {'type': 'http', 'target': 'http://127.0.0.1:{{settings.port}}/'},
        'links': [{'label': 'WebDAV Address', 'url': 'http://{{host}}:{{settings.port}}/'}],
        'actions': [
            {'id': 'size', 'label': 'Storage Used', 'command': '{{bin.rclone}}', 'args': ['size', '{{dataDir}}/storage', '--config', '{{runtimeDir}}/rclone.conf']},
            {'id': 'backup', 'label': 'Back Up Now', 'background': True, 'command': '{{bin.rclone}}',
             'args': ['sync', '{{dataDir}}/storage', '{{settings.backupRemote}}', '--config', '{{runtimeDir}}/rclone.conf', '--stats', '15s', '--stats-one-line', '-v']},
            {'id': 'check', 'label': 'Test Backup Destination', 'command': '{{bin.rclone}}', 'args': ['lsd', '{{settings.backupRemote}}', '--config', '{{runtimeDir}}/rclone.conf'], 'timeoutSec': 60},
        ],
        'folders': [{'id': 'storage', 'label': 'Files', 'root': '{{dataDir}}/storage', 'maxFileMB': 100, 'description': 'Everything in your cloud drive.'}],
    },
    extra={'templates/rclone.conf': '{{#if settings.backupEnabled}}{{settings.backupConfig}}{{/if}}\n'},
))

# ───────────────────────────── Plex ─────────────────────────────
MEDIA_FOLDERS = [
    {'id': 'movies', 'label': 'Movies', 'root': '{{dataDir}}/media/movies', 'maxFileMB': 100},
    {'id': 'tv', 'label': 'TV Shows', 'root': '{{dataDir}}/media/tv-shows', 'maxFileMB': 100, 'description': 'One folder per show, then Season 01, Season 02…'},
    {'id': 'music', 'label': 'Music', 'root': '{{dataDir}}/media/music', 'maxFileMB': 100},
    {'id': 'photos', 'label': 'Photos', 'root': '{{dataDir}}/media/photos', 'maxFileMB': 100},
]
PLUGINS.append(dict(
    slug='plex',
    icon=icon('#FFC93C', '#E08A00', '<rect x="52" y="70" width="152" height="116" rx="18"/><path d="M112 102v52l44-26z" fill="#fff"/>'),
    scripts=['claim.mjs', ('_shared/media.mjs', 'media.mjs')],
    manifest={
        'id': 'dev.easyserver.plex', 'name': 'Plex Media Server', 'subtitle': 'Stream your movies, shows and music',
        'category': 'media', 'platforms': ALL,
        'description': 'Runs Plex Media Server so you can stream your own movies, TV shows, music and photos to Plex apps on phones, TVs and computers.\n\n'
                       'Upload media to the Movies, TV Shows, Music and Photos folders here, then add them as libraries in Plex. Show Media Folder Paths gives the exact locations.\n\n'
                       'Setting up a server with no screen? Get a claim token at plex.tv/claim, paste it into Settings, and run Link to Plex Account.\n\n'
                       'If Plex already starts on its own (at login, or as a Linux service), turn that off first so only EasyServer runs it.',
        'requires': [{
            'id': 'plex', 'label': 'Plex Media Server',
            'candidates': {
                'darwin': [{'path': '/Applications/Plex Media Server.app/Contents/MacOS/Plex Media Server'}],
                'linux': [{'path': '/usr/lib/plexmediaserver/Plex Media Server'}],
                'win32': [{'path': 'C:/Program Files/Plex/Plex Media Server/Plex Media Server.exe'}, {'path': 'C:/Program Files (x86)/Plex/Plex Media Server/Plex Media Server.exe'}],
            },
            'install': {
                'darwin': ['brew install --cask plex-media-server'],
                'linux': ['command -v apt-get >/dev/null || { echo "Download Plex from plex.tv/media-server-downloads"; exit 1; }; '
                          'curl -fsSL https://downloads.plex.tv/plex-keys/PlexSign.key | sudo -n gpg --dearmor --yes -o /usr/share/keyrings/plex.gpg && '
                          'echo "deb [signed-by=/usr/share/keyrings/plex.gpg] https://downloads.plex.tv/repo/deb public main" | sudo -n tee /etc/apt/sources.list.d/plexmediaserver.list >/dev/null && '
                          'sudo -n apt-get update && sudo -n apt-get install -y plexmediaserver && sudo -n systemctl disable --now plexmediaserver'],
                'win32': [winget('Plex.PlexMediaServer')],
            },
            'hint': 'Install Plex Media Server from plex.tv/media-server-downloads.',
        }],
        'settings': [
            {'key': 'claimToken', 'label': 'Claim Token', 'type': 'password', 'default': '', 'placeholder': 'claim-…', 'restart': False,
             'description': 'From plex.tv/claim. Lasts 4 minutes; run Link to Plex Account right after saving.'},
            {'key': 'friendlyName', 'label': 'Server Name in Plex', 'type': 'string', 'default': '', 'placeholder': 'Uses the computer name', 'restart': True},
        ],
        'run': {'command': '{{bin.plex}}', 'env': {
            'PLEX_MEDIA_SERVER_APPLICATION_SUPPORT_DIR': '{{#if isLinux}}{{dataDir}}/library{{/if}}',
            'PLEX_MEDIA_SERVER_HOME': '{{#if isLinux}}/usr/lib/plexmediaserver{{/if}}',
            'PLEX_MEDIA_SERVER_INFO_DEVICE': '{{settings.friendlyName}}',
            'LD_LIBRARY_PATH': '{{#if isLinux}}/usr/lib/plexmediaserver/lib{{/if}}',
        }},
        'health': {'type': 'http', 'target': 'http://127.0.0.1:32400/identity'},
        'links': [{'label': 'Open Plex', 'url': 'http://{{host}}:32400/web'}],
        'actions': [
            {'id': 'claim', 'label': 'Link to Plex Account', **node('claim.mjs')},
            {'id': 'paths', 'label': 'Show Media Folder Paths', **node('media.mjs', 'paths')},
        ],
        'folders': MEDIA_FOLDERS,
    },
))

# ───────────────────────────── Jellyfin ─────────────────────────────
JELLY_ARGS = ['--datadir', '{{dataDir}}/data', '--cachedir', '{{dataDir}}/cache', '--configdir', '{{dataDir}}/config', '--logdir', '{{logsDir}}/jellyfin']
PLUGINS.append(dict(
    slug='jellyfin',
    icon=icon('#BF5AF2', '#6E2BB8', '<path d="M128 58l70 122H58z"/><path d="M128 110l30 52H98z"/>'),
    scripts=[('_shared/media.mjs', 'media.mjs')],
    manifest={
        'id': 'dev.easyserver.jellyfin', 'name': 'Jellyfin', 'subtitle': 'Free media server with no account',
        'category': 'media', 'platforms': ALL,
        'description': 'Runs Jellyfin, the free and open-source media server. Stream your movies, shows, music and photos to the Jellyfin apps or any web browser, with no account or subscription.\n\n'
                       'Upload media to the Movies, TV Shows, Music and Photos folders, then add them as libraries during Jellyfin’s first-run setup. Show Media Folder Paths gives the exact locations.\n\n'
                       'Jellyfin keeps its database with this plugin, so it doesn’t touch another Jellyfin install on the same computer.',
        'requires': [{
            'id': 'jellyfin', 'label': 'Jellyfin Server',
            'candidates': {
                'darwin': [{'path': '/Applications/Jellyfin.app/Contents/MacOS/jellyfin'}, {'path': '/Applications/Jellyfin Server.app/Contents/MacOS/jellyfin'}],
                'linux': [{'path': '/usr/lib/jellyfin/bin/jellyfin', 'vars': {'webdir': '/usr/share/jellyfin/web', 'ffmpeg': '/usr/lib/jellyfin-ffmpeg/ffmpeg'}}],
                'win32': [{'path': 'C:/Program Files/Jellyfin/Server/jellyfin.exe'}],
            },
            'install': {
                'darwin': ['brew install --cask jellyfin'],
                'linux': ['curl -fsSL https://repo.jellyfin.org/install-debuntu.sh | sudo -n bash && sudo -n systemctl disable --now jellyfin'],
                'win32': [winget('Jellyfin.Server')],
            },
            'hint': 'Install Jellyfin Server from jellyfin.org/downloads/server.',
        }],
        'settings': [
            {'key': 'port', 'label': 'Web Port', 'type': 'port', 'default': 8096, 'min': 1024, 'restart': False,
             'description': 'The port set in Jellyfin’s Dashboard › Networking. Change it there first, then here.'},
        ],
        'run': {'command': '{{bin.jellyfin}}', 'args': JELLY_ARGS},
        'platformRun': {'linux': {'command': '{{bin.jellyfin}}', 'args': JELLY_ARGS + ['--webdir', '{{req.jellyfin.webdir}}', '--ffmpeg', '{{req.jellyfin.ffmpeg}}']}},
        'health': {'type': 'http', 'target': 'http://127.0.0.1:{{settings.port}}/health'},
        'links': [{'label': 'Open Jellyfin', 'url': 'http://{{host}}:{{settings.port}}/'}],
        'logs': [{'id': 'jellyfin', 'label': 'Jellyfin Log', 'path': '{{logsDir}}/jellyfin/log_latest.log'}],
        'actions': [{'id': 'paths', 'label': 'Show Media Folder Paths', **node('media.mjs', 'paths')}],
        'folders': MEDIA_FOLDERS,
    },
))

# ───────────────────────────── Cloudflare Tunnel ─────────────────────────────
CF_BASE = 'https://github.com/cloudflare/cloudflared/releases/latest/download'
PLUGINS.append(dict(
    slug='cloudflare-tunnel',
    icon=icon('#F48120', '#C2410C', '<path d="M44 182a84 84 0 0 1 168 0"/><path d="M80 182a48 48 0 0 1 96 0"/><path d="M32 182h192"/>'),
    scripts=['url.mjs', ('_shared/download.mjs', 'download.mjs')],
    manifest={
        'id': 'dev.easyserver.cloudflared', 'name': 'Cloudflare Tunnel', 'subtitle': 'Put a site online without port forwarding',
        'category': 'networking', 'platforms': ALL,
        'description': 'Shares a website or app running on this computer with the whole internet through Cloudflare, without opening ports on your router.\n\n'
                       'Quick mode needs no account: it gives you a random trycloudflare.com address. Show Public Address tells you what it is. '
                       'With a Cloudflare account, create a tunnel in Zero Trust › Networks › Tunnels, paste its token here, and use your own domain.\n\n'
                       'Pair it with the Apache Web Server plugin to publish a site in a minute.',
        'requires': [{
            'id': 'cloudflared', 'label': 'cloudflared',
            'candidates': {
                'darwin': [{'path': '/opt/homebrew/bin/cloudflared'}, {'path': '/usr/local/bin/cloudflared'}, {'path': '{{dataDir}}/bin/cloudflared'}, {'path': '@path:cloudflared'}],
                'linux': [{'path': '/usr/local/bin/cloudflared'}, {'path': '/usr/bin/cloudflared'}, {'path': '{{dataDir}}/bin/cloudflared'}, {'path': '@path:cloudflared'}],
                'win32': [{'path': 'C:/Program Files (x86)/cloudflared/cloudflared.exe'}, {'path': 'C:/Program Files/cloudflared/cloudflared.exe'}, {'path': '{{dataDir}}/bin/cloudflared.exe'}],
            },
            'install': {
                'darwin': [f'if command -v brew >/dev/null; then brew install cloudflared; else mkdir -p "{{{{dataDir}}}}/bin" && curl -fsSL {CF_BASE}/cloudflared-darwin-{ARCH}.tgz | tar -xz -C "{{{{dataDir}}}}/bin"; fi'],
                'linux': [dl(f'{CF_BASE}/cloudflared-linux-{ARCH}', '{{dataDir}}/bin/cloudflared')],
                'win32': [dl(f'{CF_BASE}/cloudflared-windows-amd64.exe', '{{dataDir}}/bin/cloudflared.exe')],
            },
            'hint': 'Install cloudflared from developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads.',
        }],
        'settings': [
            {'key': 'mode', 'label': 'Tunnel', 'type': 'select', 'default': 'quick',
             'options': [{'label': 'Quick (No Account)', 'value': 'quick'}, {'label': 'My Cloudflare Account', 'value': 'token'}]},
            {'key': 'target', 'label': 'Local Address to Share', 'type': 'url', 'default': 'http://localhost:8080', 'required': True,
             'visibleIf': {'key': 'mode', 'equals': 'quick'}, 'description': 'For example, the Apache Web Server plugin’s address.'},
            {'key': 'token', 'label': 'Tunnel Token', 'type': 'password', 'default': '', 'required': True, 'visibleIf': {'key': 'mode', 'equals': 'token'},
             'description': 'From Zero Trust › Networks › Tunnels › your tunnel › Install connector.'},
            {'key': 'protocol', 'label': 'Protocol', 'type': 'select', 'default': 'auto', 'group': 'Advanced',
             'options': [{'label': 'Automatic', 'value': 'auto'}, {'label': 'QUIC', 'value': 'quic'}, {'label': 'HTTP/2', 'value': 'http2'}],
             'description': 'Try HTTP/2 if your network blocks UDP.'},
            PORT('metricsPort', 20241, 'Status Port', group='Advanced', description='Used by EasyServer to check the tunnel is connected.'),
            {'key': 'logLevel', 'label': 'Log Detail', 'type': 'select', 'default': 'info', 'group': 'Advanced',
             'options': [{'label': 'Normal', 'value': 'info'}, {'label': 'Warnings Only', 'value': 'warn'}, {'label': 'Debug', 'value': 'debug'}]},
        ],
        'run': {'command': '{{bin.cloudflared}}', 'args': [
            'tunnel', '--no-autoupdate', '--metrics', '127.0.0.1:{{settings.metricsPort}}', '--protocol', '{{settings.protocol}}', '--loglevel', '{{settings.logLevel}}',
            '{{#if settings.mode=quick}}--url{{/if}}', '{{#if settings.mode=quick}}{{settings.target}}{{/if}}', '{{#if settings.mode=token}}run{{/if}}',
        ], 'env': {'TUNNEL_TOKEN': '{{#if settings.mode=token}}{{settings.token}}{{/if}}'}},
        'health': {'type': 'http', 'target': 'http://127.0.0.1:{{settings.metricsPort}}/ready', 'intervalSec': 30},
        'actions': [
            {'id': 'url', 'label': 'Show Public Address', **node('url.mjs')},
            {'id': 'version', 'label': 'cloudflared Version', 'command': '{{bin.cloudflared}}', 'args': ['--version']},
        ],
    },
))

# ───────────────────────────── Xcode CLI ─────────────────────────────
PLUGINS.append(dict(
    slug='xcode',
    icon=icon('#3A8DFF', '#1452C8', '<path d="M96 84l-44 44 44 44"/><path d="M160 84l44 44-44 44"/><path d="M142 66l-28 124"/>'),
    scripts=['xcode.mjs'],
    manifest={
        'id': 'dev.easyserver.xcode', 'name': 'Xcode Builds', 'subtitle': 'Build and test Xcode projects remotely',
        'category': 'developer-tools', 'platforms': ['darwin'],
        'description': 'Turns a Mac into a build machine for your iOS, iPadOS and macOS apps using Xcode’s command-line tools.\n\n'
                       'Upload a project folder to Projects. It builds automatically once the upload settles, or use Build, Run Tests and Archive. '
                       'Built apps and archives are zipped into Builds for you to download, and every line of xcodebuild output is in Logs.\n\n'
                       'Needs Xcode installed from the Mac App Store, opened once to finish setup.',
        'requires': [{
            'id': 'xcodebuild', 'label': 'Xcode command-line tools',
            'candidates': {'darwin': [{'path': '/Applications/Xcode.app/Contents/Developer/usr/bin/xcodebuild'}, {'path': '/Applications/Xcode*.app/Contents/Developer/usr/bin/xcodebuild'}, {'path': '/usr/bin/xcodebuild'}]},
            'hint': 'Install Xcode from the Mac App Store and open it once.',
        }],
        'settings': [
            {'key': 'project', 'label': 'Project', 'type': 'string', 'default': '', 'placeholder': 'Found automatically', 'group': 'Project',
             'description': 'Path inside Projects, like MyApp/MyApp.xcworkspace. Leave empty to use the first one found.'},
            {'key': 'scheme', 'label': 'Scheme', 'type': 'string', 'default': '', 'placeholder': 'First shared scheme', 'group': 'Project'},
            {'key': 'configuration', 'label': 'Configuration', 'type': 'select', 'default': 'Debug', 'group': 'Project',
             'options': [{'label': 'Debug', 'value': 'Debug'}, {'label': 'Release', 'value': 'Release'}]},
            {'key': 'destination', 'label': 'Destination', 'type': 'select', 'default': 'generic/platform=iOS Simulator', 'group': 'Project',
             'options': [{'label': 'iOS Simulator', 'value': 'generic/platform=iOS Simulator'}, {'label': 'iOS Device', 'value': 'generic/platform=iOS'},
                         {'label': 'Mac', 'value': 'platform=macOS'}, {'label': 'visionOS Simulator', 'value': 'generic/platform=visionOS Simulator'}]},
            {'key': 'buildOnUpload', 'label': 'Build When Projects Change', 'type': 'boolean', 'default': True, 'group': 'Automation'},
            {'key': 'clean', 'label': 'Clean Before Building', 'type': 'boolean', 'default': False, 'group': 'Automation', 'restart': False},
            {'key': 'skipSigning', 'label': 'Skip Code Signing', 'type': 'boolean', 'default': True, 'group': 'Automation', 'restart': False,
             'description': 'Simulator and test builds don’t need a certificate. Archives always sign.'},
            {'key': 'extraArgs', 'label': 'Extra xcodebuild Arguments', 'type': 'list', 'default': [], 'group': 'Automation', 'placeholder': 'e.g. -quiet', 'restart': False},
        ],
        'run': node('xcode.mjs', 'watch'),
        'actions': [
            {'id': 'build', 'label': 'Build', 'background': True, **node('xcode.mjs', 'build')},
            {'id': 'test', 'label': 'Run Tests', 'background': True, **node('xcode.mjs', 'test')},
            {'id': 'archive', 'label': 'Archive', 'background': True, **node('xcode.mjs', 'archive')},
            {'id': 'schemes', 'label': 'List Schemes', 'timeoutSec': 120, **node('xcode.mjs', 'schemes')},
            {'id': 'simulators', 'label': 'List Simulators', **node('xcode.mjs', 'simulators')},
            {'id': 'version', 'label': 'Xcode Version', 'command': '{{bin.xcodebuild}}', 'args': ['-version']},
            {'id': 'license', 'label': 'Accept Xcode License', 'command': '/usr/bin/sudo', 'args': ['-n', '{{bin.xcodebuild}}', '-license', 'accept'],
             'description': 'Needs passwordless sudo, or accept it once in Xcode.'},
        ],
        'folders': [
            {'id': 'projects', 'label': 'Projects', 'root': '{{dataDir}}/projects', 'maxFileMB': 100, 'description': 'Upload your project folder (with its .xcodeproj or .xcworkspace).'},
            {'id': 'builds', 'label': 'Builds', 'root': '{{dataDir}}/builds', 'description': 'Zipped apps and archives.'},
        ],
    },
))

# ───────────────────────────── Remote Control ─────────────────────────────
PLUGINS.append(dict(
    slug='remote-control',
    icon=icon('#30D158', '#13893A', '<rect x="46" y="58" width="164" height="112" rx="14"/><path d="M104 198h48M128 170v28"/><path d="M116 92l42 18-18 7-7 18z"/>'),
    scripts=['remote.mjs', 'power.mjs', 'screenshot.mjs'],
    manifest={
        'id': 'dev.easyserver.remote', 'name': 'Remote Control', 'subtitle': 'See and control this computer from anywhere',
        'category': 'networking', 'platforms': ALL,
        'description': 'Control this computer’s screen, keyboard and mouse from another device with RustDesk, a free and open-source remote desktop app. '
                       'Show RustDesk ID gives you the ID to type into RustDesk on your other device, with the password from Settings.\n\n'
                       'From the app you can also lock the screen, put the computer to sleep, restart it or shut it down, and take screenshots to download.\n\n'
                       'On a Mac, allow Screen Recording and Accessibility for RustDesk in System Settings › Privacy & Security.',
        'requires': [{
            'id': 'rustdesk', 'label': 'RustDesk',
            'candidates': {
                'darwin': [{'path': '/Applications/RustDesk.app/Contents/MacOS/RustDesk'}],
                'linux': [{'path': '/usr/bin/rustdesk'}, {'path': '/usr/lib/rustdesk/rustdesk'}, {'path': '@path:rustdesk'}],
                'win32': [{'path': 'C:/Program Files/RustDesk/rustdesk.exe'}],
            },
            'install': {'darwin': ['brew install --cask rustdesk'], 'win32': [winget('RustDesk.RustDesk')], 'linux': ['echo "Download RustDesk for Linux from rustdesk.com"; exit 1']},
            'hint': 'Install RustDesk from rustdesk.com.',
        }],
        'settings': [
            {'key': 'password', 'label': 'Remote Desktop Password', 'type': 'password', 'default': '', 'group': 'Remote Desktop',
             'pattern': '^.{8,}$', 'patternHint': 'At least 8 characters.', 'description': 'Lets you connect without someone accepting on this computer.'},
            {'key': 'allowPower', 'label': 'Allow Restart and Shut Down', 'type': 'boolean', 'default': True, 'group': 'Power', 'restart': False},
            {'key': 'powerDelay', 'label': 'Delay Before Restart or Shut Down', 'type': 'slider', 'default': 1, 'min': 0, 'max': 10, 'unit': 'min', 'group': 'Power', 'restart': False,
             'visibleIf': {'key': 'allowPower', 'equals': True}},
        ],
        'run': node('remote.mjs', 'run'),
        'actions': [
            {'id': 'id', 'label': 'Show RustDesk ID', **node('remote.mjs', 'id')},
            {'id': 'screenshot', 'label': 'Take Screenshot', **node('screenshot.mjs')},
            {'id': 'lock', 'label': 'Lock Screen', **node('power.mjs', 'lock')},
            {'id': 'sleep', 'label': 'Sleep', 'confirm': 'Put this computer to sleep? It goes offline until something wakes it.', **node('power.mjs', 'sleep')},
            {'id': 'restart', 'label': 'Restart', 'confirm': 'Restart this computer? EasyServer comes back if it starts automatically.', 'destructive': True, **node('power.mjs', 'restart')},
            {'id': 'shutdown', 'label': 'Shut Down', 'confirm': 'Shut down this computer? You’ll need to turn it on in person.', 'destructive': True, **node('power.mjs', 'shutdown')},
            {'id': 'cancel', 'label': 'Cancel Restart or Shut Down', **node('power.mjs', 'cancel')},
        ],
        'folders': [{'id': 'screenshots', 'label': 'Screenshots', 'root': '{{dataDir}}/screenshots'}],
    },
))

# ───────────────────────────── Minecraft ─────────────────────────────
PLUGINS.append(dict(
    slug='minecraft',
    icon=icon('#6BBF3B', '#3E7A1F', '<path d="M128 50l68 38v80l-68 38-68-38V88z"/><path d="M60 88l68 38 68-38M128 126v80"/>'),
    scripts=['server.mjs', 'fetch-server.mjs', 'rcon.mjs', 'backup.mjs'],
    manifest={
        'id': 'dev.easyserver.minecraft', 'name': 'Minecraft Server', 'subtitle': 'Host a Java Edition world for friends',
        'category': 'games', 'platforms': ALL,
        'description': 'Hosts a Minecraft: Java Edition world using Mojang’s official server, downloaded straight from Mojang and checked before it runs.\n\n'
                       'Pick the version, game mode, difficulty and player limit in Settings. Operators and allowed players apply as soon as the world is up. '
                       'Back Up World saves a copy to Backups that you can download, and Server Files holds mods, datapacks and the world itself.\n\n'
                       'Players on your network join with this computer’s address. For friends elsewhere, forward the port on your router.\n\n'
                       'You must accept the Minecraft EULA (aka.ms/MinecraftEULA) in Settings before the server will start.',
        'requires': [
            {
                'id': 'java', 'label': 'Java 21',
                'candidates': {
                    'darwin': [{'path': '/opt/homebrew/opt/openjdk@21/bin/java'}, {'path': '/opt/homebrew/opt/openjdk/bin/java'}, {'path': '/usr/local/opt/openjdk@21/bin/java'},
                               {'path': '/usr/local/opt/openjdk/bin/java'}, {'path': '/Library/Java/JavaVirtualMachines/*/Contents/Home/bin/java'}],
                    'linux': [{'path': '/usr/lib/jvm/java-2*-openjdk*/bin/java'}, {'path': '/usr/lib/jvm/temurin-2*/bin/java'}, {'path': '/usr/lib/jvm/jre-2*/bin/java'}, {'path': '@path:java'}],
                    'win32': [{'path': 'C:/Program Files/Eclipse Adoptium/jre-2*/bin/java.exe'}, {'path': 'C:/Program Files/Eclipse Adoptium/jdk-2*/bin/java.exe'},
                              {'path': 'C:/Program Files/Microsoft/jdk-2*/bin/java.exe'}, {'path': 'C:/Program Files/Java/jdk-2*/bin/java.exe'}, {'path': '@path:java'}],
                },
                'install': {'darwin': ['brew install openjdk@21'], 'linux': [linux_pkg('openjdk-21-jre-headless', 'java-21-openjdk-headless', 'jre21-openjdk-headless')],
                            'win32': [winget('EclipseAdoptium.Temurin.21.JRE')]},
                'hint': 'Install Java 21 (for example from adoptium.net).',
            },
            {
                'id': 'server', 'label': 'Minecraft server',
                'candidates': {p: [{'path': '{{dataDir}}/server/server.jar'}] for p in ALL},
                'install': {p: [node('fetch-server.mjs')] for p in ALL},
                'hint': 'Couldn’t download the server from Mojang. Check this computer’s internet connection.',
            },
        ],
        'settings': [
            {'key': 'eula', 'label': 'I Accept the Minecraft EULA', 'type': 'boolean', 'default': False, 'group': 'Server', 'description': 'Required by Mojang. Read it at aka.ms/MinecraftEULA.'},
            {'key': 'version', 'label': 'Version', 'type': 'string', 'default': 'latest', 'group': 'Server', 'pattern': '^(latest|snapshot|\\d+\\.\\d+(\\.\\d+)?)$',
             'patternHint': 'latest, snapshot, or a version like 1.21.4.', 'description': 'Changing it downloads that version on the next start.'},
            PORT('port', 25565, group='Server'),
            {'key': 'memory', 'label': 'Memory', 'type': 'slider', 'default': 2048, 'min': 1024, 'max': 16384, 'step': 512, 'unit': 'MB', 'group': 'Server'},
            {'key': 'motd', 'label': 'Server Message', 'type': 'string', 'default': 'An EasyServer world', 'group': 'Server', 'description': 'Shown in the multiplayer server list.'},
            {'key': 'levelName', 'label': 'World Name', 'type': 'string', 'default': 'world', 'group': 'World', 'pattern': '^[A-Za-z0-9 _-]+$', 'patternHint': 'Letters, numbers, spaces, dashes and underscores.'},
            {'key': 'seed', 'label': 'Seed', 'type': 'string', 'default': '', 'group': 'World', 'placeholder': 'Random', 'description': 'Only used when a new world is created.'},
            {'key': 'gamemode', 'label': 'Game Mode', 'type': 'select', 'default': 'survival', 'group': 'World',
             'options': [{'label': 'Survival', 'value': 'survival'}, {'label': 'Creative', 'value': 'creative'}, {'label': 'Adventure', 'value': 'adventure'}, {'label': 'Spectator', 'value': 'spectator'}]},
            {'key': 'difficulty', 'label': 'Difficulty', 'type': 'select', 'default': 'normal', 'group': 'World',
             'options': [{'label': 'Peaceful', 'value': 'peaceful'}, {'label': 'Easy', 'value': 'easy'}, {'label': 'Normal', 'value': 'normal'}, {'label': 'Hard', 'value': 'hard'}]},
            {'key': 'hardcore', 'label': 'Hardcore', 'type': 'boolean', 'default': False, 'group': 'World'},
            {'key': 'pvp', 'label': 'Player vs. Player', 'type': 'boolean', 'default': True, 'group': 'World'},
            {'key': 'allowFlight', 'label': 'Allow Flight', 'type': 'boolean', 'default': False, 'group': 'World'},
            {'key': 'commandBlocks', 'label': 'Command Blocks', 'type': 'boolean', 'default': False, 'group': 'World'},
            {'key': 'viewDistance', 'label': 'View Distance', 'type': 'slider', 'default': 10, 'min': 3, 'max': 32, 'unit': 'chunks', 'group': 'Performance'},
            {'key': 'simulationDistance', 'label': 'Simulation Distance', 'type': 'slider', 'default': 10, 'min': 3, 'max': 32, 'unit': 'chunks', 'group': 'Performance'},
            {'key': 'maxPlayers', 'label': 'Maximum Players', 'type': 'slider', 'default': 10, 'min': 1, 'max': 100, 'group': 'Players'},
            {'key': 'onlineMode', 'label': 'Require Minecraft Accounts', 'type': 'boolean', 'default': True, 'group': 'Players',
             'description': 'Checks every player with Mojang. Leave on unless you know why you need it off.'},
            {'key': 'operators', 'label': 'Operators', 'type': 'list', 'default': [], 'group': 'Players', 'placeholder': 'Player name',
             'pattern': '^[A-Za-z0-9_]{3,16}$', 'patternHint': 'A Minecraft username.', 'restart': False},
            {'key': 'whitelist', 'label': 'Only Allowed Players', 'type': 'boolean', 'default': False, 'group': 'Players'},
            {'key': 'whitelistPlayers', 'label': 'Allowed Players', 'type': 'list', 'default': [], 'group': 'Players', 'placeholder': 'Player name',
             'pattern': '^[A-Za-z0-9_]{3,16}$', 'patternHint': 'A Minecraft username.', 'visibleIf': {'key': 'whitelist', 'equals': True}, 'restart': False},
            {'key': 'spawnProtection', 'label': 'Spawn Protection', 'type': 'number', 'default': 16, 'min': 0, 'max': 256, 'unit': 'blocks', 'group': 'Players'},
            {'key': 'keepBackups', 'label': 'Backups to Keep', 'type': 'slider', 'default': 10, 'min': 1, 'max': 50, 'group': 'Backups', 'restart': False},
            {'key': 'rconPort', 'label': 'Console Port', 'type': 'port', 'default': 25575, 'min': 1024, 'group': 'Advanced',
             'description': 'Local-only port EasyServer uses to send commands to the server.'},
        ],
        'run': {**node('server.mjs'), 'cwd': '{{dataDir}}/server', 'stop': {**node('rcon.mjs', 'stop'), 'timeoutSec': 45}},
        'health': {'type': 'tcp', 'target': '127.0.0.1:{{settings.port}}', 'intervalSec': 30},
        'actions': [
            {'id': 'players', 'label': 'Who’s Online', **node('rcon.mjs', 'list')},
            {'id': 'save', 'label': 'Save World', **node('rcon.mjs', 'save')},
            {'id': 'backup', 'label': 'Back Up World', 'background': True, **node('backup.mjs')},
            {'id': 'apply', 'label': 'Apply Operators and Allowed Players', **node('rcon.mjs', 'players')},
            {'id': 'day', 'label': 'Set Time to Day', **node('rcon.mjs', 'day')},
            {'id': 'weather', 'label': 'Clear Weather', **node('rcon.mjs', 'weather')},
            {'id': 'update', 'label': 'Download Server Again', 'description': 'Gets the version in Settings fresh from Mojang. Restart afterwards.', 'background': True,
             **node('fetch-server.mjs', '--force')},
        ],
        'folders': [
            {'id': 'backups', 'label': 'Backups', 'root': '{{dataDir}}/backups'},
            {'id': 'server', 'label': 'Server Files', 'root': '{{dataDir}}/server', 'maxFileMB': 100,
             'description': 'The world, mods, datapacks and config. Stop the server before changing the world.'},
        ],
    },
))

# ───────────────────────────── Docker ─────────────────────────────
DOCKER_REQ = {
    'id': 'docker', 'label': 'Docker',
    'candidates': {
        'darwin': [{'path': '/usr/local/bin/docker'}, {'path': '/opt/homebrew/bin/docker'}, {'path': '/Applications/Docker.app/Contents/Resources/bin/docker'}, {'path': '@path:docker'}],
        'linux': [{'path': '/usr/bin/docker'}, {'path': '/usr/local/bin/docker'}, {'path': '@path:docker'}],
        'win32': [{'path': 'C:/Program Files/Docker/Docker/resources/bin/docker.exe'}, {'path': '@path:docker'}],
    },
    'install': {
        'darwin': ['brew install --cask docker'],
        'linux': ['curl -fsSL https://get.docker.com | sudo -n sh && sudo -n usermod -aG docker "$USER"'],
        'win32': [winget('Docker.DockerDesktop')],
    },
    'hint': 'Install Docker Desktop (docker.com) or Docker Engine, open it once, then press Install again.',
}
PLUGINS.append(dict(
    slug='docker',
    icon=icon('#2496ED', '#0B5FB0', '<rect x="56" y="112" width="40" height="40" rx="6"/><rect x="108" y="112" width="40" height="40" rx="6"/><rect x="160" y="112" width="40" height="40" rx="6"/><rect x="82" y="60" width="40" height="40" rx="6"/><rect x="134" y="60" width="40" height="40" rx="6"/><path d="M48 176h160"/>'),
    scripts=['compose.mjs'],
    manifest={
        'id': 'dev.easyserver.docker', 'name': 'Docker', 'subtitle': 'Run containers from a Compose file',
        'category': 'developer-tools', 'platforms': ALL,
        'description': 'Runs any set of containers described in a Docker Compose file: databases, web apps, home automation, game servers and more.\n\n'
                       'Write the Compose file in Settings, or upload a whole project with a compose.yaml and Dockerfiles to Project Files. '
                       'Starting the plugin brings everything up and streams container logs to Output; stopping it stops, removes or keeps the containers, as you choose.\n\n'
                       'Needs Docker Desktop on Mac and Windows, or Docker Engine on Linux. EasyServer starts Docker if it isn’t running.',
        'requires': [DOCKER_REQ],
        'settings': [
            {'key': 'projectName', 'label': 'Project Name', 'type': 'string', 'default': 'easyserver', 'group': 'Project', 'pattern': '^[a-z0-9][a-z0-9_-]*$',
             'patternHint': 'Lowercase letters, numbers, dashes and underscores.'},
            {'key': 'source', 'label': 'Compose File', 'type': 'select', 'default': 'inline', 'group': 'Project',
             'options': [{'label': 'Written Below', 'value': 'inline'}, {'label': 'From Project Files', 'value': 'folder'}]},
            {'key': 'compose', 'label': 'compose.yaml', 'type': 'text', 'rows': 14, 'group': 'Project', 'visibleIf': {'key': 'source', 'equals': 'inline'},
             'default': 'services:\n  web:\n    image: nginx:alpine\n    ports:\n      - "8081:80"\n    volumes:\n      - ./site:/usr/share/nginx/html:ro\n    restart: unless-stopped\n',
             'description': 'Relative paths like ./site point into Project Files.'},
            {'key': 'envVars', 'label': 'Environment Variables', 'type': 'text', 'rows': 4, 'default': '', 'group': 'Project',
             'description': 'One NAME=value per line, available to the Compose file as ${NAME}.'},
            {'key': 'pullPolicy', 'label': 'Download Images', 'type': 'select', 'default': 'missing', 'group': 'Behavior',
             'options': [{'label': 'When Missing', 'value': 'missing'}, {'label': 'Every Start', 'value': 'always'}, {'label': 'Never', 'value': 'never'}]},
            {'key': 'build', 'label': 'Build Images from Project Files', 'type': 'boolean', 'default': False, 'group': 'Behavior'},
            {'key': 'onStop', 'label': 'When the Plugin Stops', 'type': 'select', 'default': 'stop', 'group': 'Behavior', 'restart': False,
             'options': [{'label': 'Stop Containers', 'value': 'stop'}, {'label': 'Remove Containers', 'value': 'down'}, {'label': 'Leave Running', 'value': 'keep'}]},
        ],
        'templates': [{'src': 'templates/compose.yaml', 'dest': 'compose.yaml'}, {'src': 'templates/compose.env', 'dest': 'compose.env'}],
        'run': {**node('compose.mjs', 'up'), 'stop': {**node('compose.mjs', 'stop'), 'timeoutSec': 120}},
        'actions': [
            {'id': 'ps', 'label': 'Show Containers', **node('compose.mjs', 'ps')},
            {'id': 'pull', 'label': 'Download Image Updates', 'background': True, **node('compose.mjs', 'pull')},
            {'id': 'build', 'label': 'Rebuild Images', 'background': True, **node('compose.mjs', 'build')},
            {'id': 'prune', 'label': 'Remove Unused Images', 'confirm': 'Delete every Docker image no container uses? They download again when needed.', 'destructive': True,
             'command': '{{bin.docker}}', 'args': ['image', 'prune', '-af'], 'timeoutSec': 300},
            {'id': 'info', 'label': 'Docker Info', 'command': '{{bin.docker}}', 'args': ['version']},
        ],
        'folders': [{'id': 'project', 'label': 'Project Files', 'root': '{{dataDir}}/project', 'maxFileMB': 100,
                     'description': 'The Compose project folder: compose.yaml, Dockerfiles, and files your containers mount.'}],
    },
    extra={'templates/compose.yaml': '{{settings.compose}}\n', 'templates/compose.env': '{{settings.envVars}}\n'},
))

# ───────────────────────────── Kubernetes ─────────────────────────────
KIND = 'https://kind.sigs.k8s.io/dl/v0.25.0'
KUBECTL = 'https://dl.k8s.io/release/v1.31.4/bin'
PLUGINS.append(dict(
    slug='kubernetes',
    icon=icon('#4F7BEF', '#2440A8', '<path d="M128 46l72 40v84l-72 40-72-40V86z"/><circle cx="128" cy="128" r="18"/><path d="M128 110V74M144 137l31 18M112 137l-31 18"/>'),
    scripts=['cluster.mjs', ('_shared/download.mjs', 'download.mjs')],
    manifest={
        'id': 'dev.easyserver.kubernetes', 'name': 'Kubernetes', 'subtitle': 'A real cluster on one computer',
        'category': 'developer-tools', 'platforms': ALL,
        'description': 'Runs a Kubernetes cluster on this computer with kind (Kubernetes in Docker), the tool the Kubernetes project uses to test itself.\n\n'
                       'Starting the plugin creates the cluster, or resumes it. Upload YAML to Manifests and it’s applied on every start, or with Apply Manifests. '
                       'Download kubeconfig.yaml from Cluster Access to use kubectl from another computer.\n\n'
                       'Ingress ports map 80 and 443 in the cluster to ports on this computer, ready for an ingress controller. Needs Docker; kind and kubectl install automatically.',
        'requires': [
            DOCKER_REQ,
            {
                'id': 'kind', 'label': 'kind',
                'candidates': {
                    'darwin': [{'path': '/opt/homebrew/bin/kind'}, {'path': '/usr/local/bin/kind'}, {'path': '{{dataDir}}/bin/kind'}],
                    'linux': [{'path': '/usr/local/bin/kind'}, {'path': '/usr/bin/kind'}, {'path': '{{dataDir}}/bin/kind'}],
                    'win32': [{'path': f'{WINGET}/kind.exe'}, {'path': '{{dataDir}}/bin/kind.exe'}],
                },
                'install': {
                    'darwin': [dl(f'{KIND}/kind-darwin-{ARCH}', '{{dataDir}}/bin/kind')],
                    'linux': [dl(f'{KIND}/kind-linux-{ARCH}', '{{dataDir}}/bin/kind')],
                    'win32': [dl(f'{KIND}/kind-windows-amd64', '{{dataDir}}/bin/kind.exe')],
                },
            },
            {
                'id': 'kubectl', 'label': 'kubectl',
                'candidates': {
                    'darwin': [{'path': '/opt/homebrew/bin/kubectl'}, {'path': '/usr/local/bin/kubectl'}, {'path': '{{dataDir}}/bin/kubectl'}],
                    'linux': [{'path': '/usr/local/bin/kubectl'}, {'path': '/usr/bin/kubectl'}, {'path': '{{dataDir}}/bin/kubectl'}],
                    'win32': [{'path': f'{WINGET}/kubectl.exe'}, {'path': 'C:/Program Files/Docker/Docker/resources/bin/kubectl.exe'}, {'path': '{{dataDir}}/bin/kubectl.exe'}],
                },
                'install': {
                    'darwin': [dl(f'{KUBECTL}/darwin/{ARCH}/kubectl', '{{dataDir}}/bin/kubectl')],
                    'linux': [dl(f'{KUBECTL}/linux/{ARCH}/kubectl', '{{dataDir}}/bin/kubectl')],
                    'win32': [dl(f'{KUBECTL}/windows/amd64/kubectl.exe', '{{dataDir}}/bin/kubectl.exe')],
                },
            },
        ],
        'settings': [
            {'key': 'clusterName', 'label': 'Cluster Name', 'type': 'string', 'default': 'easyserver', 'group': 'Cluster', 'pattern': '^[a-z0-9][a-z0-9-]*$',
             'patternHint': 'Lowercase letters, numbers and dashes.', 'description': 'Changing it creates a new cluster.'},
            {'key': 'workers', 'label': 'Worker Nodes', 'type': 'slider', 'default': 0, 'min': 0, 'max': 4, 'group': 'Cluster',
             'description': 'Applies when the cluster is created. Delete Cluster to change it.'},
            {'key': 'nodeImage', 'label': 'Node Image', 'type': 'string', 'default': '', 'group': 'Cluster', 'placeholder': 'kind’s default Kubernetes version',
             'description': 'A kindest/node image to pick a Kubernetes version, like kindest/node:v1.30.6.'},
            PORT('apiPort', 6443, 'API Port', group='Network'),
            {'key': 'exposeApi', 'label': 'Reach the API from Other Computers', 'type': 'boolean', 'default': False, 'group': 'Network'},
            {'key': 'ingressPorts', 'label': 'Ingress Ports', 'type': 'boolean', 'default': True, 'group': 'Network'},
            PORT('httpPort', 8088, 'HTTP Port', group='Network', visibleIf={'key': 'ingressPorts', 'equals': True}),
            PORT('httpsPort', 8443, 'HTTPS Port', group='Network', visibleIf={'key': 'ingressPorts', 'equals': True}),
            {'key': 'applyOnStart', 'label': 'Apply Manifests on Start', 'type': 'boolean', 'default': True, 'group': 'Behavior'},
            {'key': 'onStop', 'label': 'When the Plugin Stops', 'type': 'select', 'default': 'stop', 'group': 'Behavior', 'restart': False,
             'options': [{'label': 'Pause Cluster', 'value': 'stop'}, {'label': 'Delete Cluster', 'value': 'delete'}, {'label': 'Leave Running', 'value': 'keep'}]},
        ],
        'run': {**node('cluster.mjs', 'up'), 'env': {'KUBECONFIG': '{{dataDir}}/access/kubeconfig.yaml'}, 'stop': {**node('cluster.mjs', 'stop'), 'timeoutSec': 180}},
        'health': {'type': 'tcp', 'target': '127.0.0.1:{{settings.apiPort}}', 'intervalSec': 30},
        'actions': [
            {'id': 'apply', 'label': 'Apply Manifests', 'timeoutSec': 300, **node('cluster.mjs', 'apply')},
            {'id': 'nodes', 'label': 'Show Nodes', 'command': '{{bin.kubectl}}', 'args': ['get', 'nodes', '-o', 'wide']},
            {'id': 'all', 'label': 'Show Everything', 'command': '{{bin.kubectl}}', 'args': ['get', 'all', '--all-namespaces']},
            {'id': 'events', 'label': 'Recent Events', 'command': '{{bin.kubectl}}', 'args': ['get', 'events', '--all-namespaces', '--sort-by=.lastTimestamp']},
            {'id': 'delete', 'label': 'Delete Cluster', 'confirm': 'Delete the cluster and everything running in it? Starting the plugin creates a fresh one.',
             'destructive': True, 'background': True, **node('cluster.mjs', 'delete')},
        ],
        'folders': [
            {'id': 'manifests', 'label': 'Manifests', 'root': '{{dataDir}}/manifests', 'accept': ['.yaml', '.yml', '.json'], 'description': 'Kubernetes YAML, applied in name order.'},
            {'id': 'access', 'label': 'Cluster Access', 'root': '{{dataDir}}/access', 'description': 'kubeconfig.yaml for kubectl and other tools.'},
        ],
    },
))

# ───────────────────────────── Terminal ─────────────────────────────
TTYD = 'https://github.com/tsl0922/ttyd/releases/download/1.7.7'
SHELL = ('{{#if settings.shell=default}}{{#if isWin}}powershell.exe{{/if}}{{#if isMac}}/bin/zsh{{/if}}{{#if isLinux}}/bin/bash{{/if}}{{/if}}'
         '{{#unless settings.shell=default}}{{settings.shell}}{{/unless}}')
PLUGINS.append(dict(
    slug='terminal',
    icon=icon('#48484A', '#1C1C1E', '<rect x="44" y="60" width="168" height="136" rx="18"/><path d="M78 106l28 24-28 24M120 160h52"/>'),
    scripts=[('_shared/download.mjs', 'download.mjs')],
    manifest={
        'id': 'dev.easyserver.terminal', 'name': 'Terminal', 'subtitle': 'A command line in your web browser',
        'category': 'developer-tools', 'platforms': ALL,
        'description': 'Opens a full terminal on this computer in any web browser, using ttyd. Run commands, edit files and manage the server from a phone, tablet or another computer.\n\n'
                       'Anyone with the username and password gets the same access you have, so choose a strong password. '
                       'It only listens on this computer until you change Who Can Connect. To reach it from outside your network, put it behind the Cloudflare Tunnel plugin with Cloudflare Access.',
        'requires': [{
            'id': 'ttyd', 'label': 'ttyd',
            'candidates': {
                'darwin': [{'path': '/opt/homebrew/bin/ttyd'}, {'path': '/usr/local/bin/ttyd'}, {'path': '@path:ttyd'}],
                'linux': [{'path': '/usr/bin/ttyd'}, {'path': '/usr/local/bin/ttyd'}, {'path': '{{dataDir}}/bin/ttyd'}],
                'win32': [{'path': '{{dataDir}}/bin/ttyd.exe'}, {'path': '@path:ttyd'}],
            },
            'install': {
                'darwin': ['brew install ttyd'],
                'linux': [dl(TTYD + '/ttyd.{{#if isArm}}aarch64{{/if}}{{#if isX64}}x86_64{{/if}}', '{{dataDir}}/bin/ttyd')],
                'win32': [dl(TTYD + '/ttyd.win32.exe', '{{dataDir}}/bin/ttyd.exe')],
            },
            'hint': 'Install ttyd from github.com/tsl0922/ttyd.',
        }],
        'settings': [
            PORT('port', 7681, group='Network'),
            LISTEN('local'),
            {'key': 'username', 'label': 'Username', 'type': 'string', 'default': 'admin', 'required': True, 'group': 'Sign In', 'pattern': '^[A-Za-z0-9._-]+$',
             'patternHint': 'Letters, numbers, dots, dashes and underscores.'},
            PASSWORD(group='Sign In', pattern='^[^:]{8,}$', patternHint='At least 8 characters, without a colon.'),
            {'key': 'writable', 'label': 'Allow Typing', 'type': 'boolean', 'default': True, 'group': 'Sign In', 'description': 'Off makes the terminal view-only.'},
            {'key': 'maxClients', 'label': 'Maximum Sessions', 'type': 'slider', 'default': 0, 'min': 0, 'max': 10, 'group': 'Sign In', 'description': '0 means no limit.'},
            {'key': 'shell', 'label': 'Shell', 'type': 'select', 'default': 'default', 'group': 'Terminal',
             'options': [{'label': 'Default', 'value': 'default'}, {'label': 'bash', 'value': 'bash'}, {'label': 'zsh', 'value': 'zsh'}, {'label': 'fish', 'value': 'fish'},
                         {'label': 'PowerShell', 'value': 'pwsh'}, {'label': 'Command Prompt', 'value': 'cmd.exe'}]},
            {'key': 'startDir', 'label': 'Start In', 'type': 'path', 'default': '', 'group': 'Terminal', 'placeholder': 'Home folder'},
            {'key': 'fontSize', 'label': 'Text Size', 'type': 'slider', 'default': 14, 'min': 10, 'max': 24, 'unit': 'pt', 'group': 'Terminal'},
            {'key': 'theme', 'label': 'Appearance', 'type': 'select', 'default': 'dark', 'group': 'Terminal',
             'options': [{'label': 'Dark', 'value': 'dark'}, {'label': 'Light', 'value': 'light'}]},
        ],
        'run': {'command': '{{bin.ttyd}}', 'args': [
            '--port', '{{settings.port}}',
            '{{#if settings.listen=local}}--interface{{/if}}', '{{#if settings.listen=local}}127.0.0.1{{/if}}',
            '--credential', '{{settings.username}}:{{settings.password}}',
            '{{#if settings.writable}}--writable{{/if}}',
            '--max-clients', '{{settings.maxClients}}',
            '{{#if settings.startDir}}--cwd{{/if}}', '{{settings.startDir}}',
            '--client-option', 'fontSize={{settings.fontSize}}',
            '--client-option', 'titleFixed={{hostname}}',
            '--client-option', '{{#if settings.theme=light}}theme={"background":"#ffffff","foreground":"#1d1d1f","cursor":"#1d1d1f","selectionBackground":"#b3d7ff"}{{/if}}{{#if settings.theme=dark}}theme={"background":"#1e1e1e","foreground":"#f5f5f7","cursor":"#f5f5f7"}{{/if}}',
            '--terminal-type', 'xterm-256color',
            SHELL,
        ]},
        'health': {'type': 'http', 'target': 'http://127.0.0.1:{{settings.port}}/'},
        'links': [{'label': 'Open Terminal', 'url': 'http://{{host}}:{{settings.port}}/'}],
        'actions': [{'id': 'version', 'label': 'ttyd Version', 'command': '{{bin.ttyd}}', 'args': ['--version']}],
    },
))


def clean(o):
    """Drops keys whose value is None (used for optional fields above)."""
    if isinstance(o, dict):
        return {k: clean(v) for k, v in o.items() if v is not None}
    if isinstance(o, list):
        return [clean(x) for x in o]
    return o


def main():
    shared = os.path.join(ROOT, '_shared')
    for p in PLUGINS:
        d = os.path.join(ROOT, p['slug'])
        os.makedirs(os.path.join(d, 'scripts'), exist_ok=True)
        files = ['icon.svg']
        with open(os.path.join(d, 'icon.svg'), 'w', encoding='utf8') as f:
            f.write(ICONS.get(p['slug'], p['icon']))
        needs_lib = bool(p['scripts'])
        for s in p['scripts']:
            if isinstance(s, tuple):
                shutil.copyfile(os.path.join(ROOT, s[0]), os.path.join(d, 'scripts', s[1]))
                files.append('scripts/' + s[1])
            else:
                files.append('scripts/' + s)
        if needs_lib:
            shutil.copyfile(os.path.join(shared, 'lib.mjs'), os.path.join(d, 'scripts', 'lib.mjs'))
            files.append('scripts/lib.mjs')
        for rel, content in p.get('extra', {}).items():
            os.makedirs(os.path.dirname(os.path.join(d, rel)), exist_ok=True)
            with open(os.path.join(d, rel), 'w', encoding='utf8') as f:
                f.write(content)
            files.append(rel)
        m = {'schema': 1, 'id': None, 'name': None, 'version': '1.0.0', 'developer': 'EasyServer', **clean(p['manifest'])}
        m['icon'] = 'icon.svg'
        m['files'] = sorted(set(files))
        order = ['schema', 'id', 'name', 'version', 'developer', 'subtitle', 'description', 'category', 'icon', 'platforms', 'files']
        m = {k: m[k] for k in order if k in m} | {k: v for k, v in m.items() if k not in order}
        with open(os.path.join(d, 'easyserver.plugin.json'), 'w', encoding='utf8') as f:
            json.dump(m, f, indent=2, ensure_ascii=False)
            f.write('\n')
        print(f"{p['slug']:<18} {len(m['files'])} files, {len(m.get('settings', []))} settings, {len(m.get('actions', []))} actions")


if __name__ == '__main__':
    main()

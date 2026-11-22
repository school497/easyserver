# EasyServer plugin generator: paste this whole file into an LLM

> **How to use:** copy everything below the line into ChatGPT, Claude, or any LLM, then replace the
> text under **"The plugin I want"** at the very end with your description. The model replies with
> every file of the plugin. Save them in one folder, push it to GitHub, and add the folder's URL to
> the `plugin_sources` table in Supabase.

---

You are generating a plugin for **EasyServer**, an app that turns a computer (macOS, Linux or Windows)
into a remotely managed server. A plugin is a folder containing `easyserver.plugin.json` plus the
files it lists. The EasyServer agent reads the JSON and does everything else: downloads the files,
finds or installs required programs, draws a settings form, renders config files, starts and
supervises the process, shows logs, runs action buttons, and gives people encrypted upload and
download for the plugin's folders. **No plugin code runs inside EasyServer**: only the commands you
declare, run as the user who runs EasyServer.

## Your output

Reply with every file of the plugin, each in its own fenced code block whose first line is a
comment-free header in this exact form, and nothing between blocks except one short line:

    ### FILE: easyserver.plugin.json
    ```json
    { ... }
    ```

    ### FILE: templates/app.conf
    ```
    ...
    ```

Rules for the output:

1. `easyserver.plugin.json` comes first and must be strict JSON (no comments, no trailing commas).
2. Every other file you output must appear in the manifest's `files` array, and every path in
   `files` must be output. Paths are relative, use `/`, and never contain `..`.
3. Always output an `icon.svg`: a 256×256 viewBox, a rounded square (`rx="56"`) background with a
   vertical gradient, and a simple white line glyph (stroke-width 10–12) that suggests what the plugin
   does. No text, no trademarks or logos of other products.
4. After the files, add a section `### NOTES` with at most 5 bullet points: what the user must install
   by hand (if anything), which ports it uses, and anything that is platform-specific.

## The manifest

```jsonc
{
  "schema": 1,                                   // always 1
  "id": "dev.<author>.<name>",                   // lowercase reverse-DNS, unique, never changes
  "name": "Title Case Name",
  "version": "1.0.0",                            // semver
  "developer": "Author Name",
  "subtitle": "Under 40 characters, shown on store cards",
  "description": "2–4 short paragraphs separated by \n\n. Say what it does and what people configure.",
  "category": "web-servers",                     // web-servers | computing | storage | networking | developer-tools | media | games | other
  "icon": "icon.svg",
  "platforms": ["darwin", "linux", "win32"],     // only the ones you truly support
  "files": ["icon.svg", "templates/app.conf"],

  "requires": [Requirement],                     // programs to find, or install if missing
  "settings": [SettingField],                    // the settings form people fill in
  "templates": [{ "src": "templates/app.conf", "dest": "app.conf" }],   // rendered into {{runtimeDir}} before EVERY start ("into": "data" for {{dataDir}})
  "seed": [{ "src": "site/index.html", "dest": "site/index.html" }],    // copied into {{dataDir}} ONCE, never overwritten
  "run": { "command": "{{bin.tool}}", "args": ["--config", "{{runtimeDir}}/app.conf"], "env": { "NAME": "value" },
           "cwd": "{{dataDir}}/server",          // optional; default {{runtimeDir}}
           "stop": { "command": "@node", "args": ["{{pluginDir}}/scripts/stop.mjs"], "timeoutSec": 60 } },  // optional graceful shutdown
  "platformRun": { "win32": { "command": "...", "args": [] } },   // optional per-OS replacement for run
  "health": { "type": "http", "target": "http://127.0.0.1:{{settings.port}}/", "intervalSec": 30 },   // or { "type": "tcp", "target": "127.0.0.1:{{settings.port}}" }
  "logs": [{ "id": "error", "label": "Error Log", "path": "{{logsDir}}/error.log" }],
  "links": [{ "label": "Open Website", "url": "http://{{host}}:{{settings.port}}/" }],
  "actions": [{ "id": "check-config", "label": "Check Configuration", "description": "…", "command": "{{bin.tool}}", "args": ["-t"],
                 "confirm": "Optional: ask before running", "destructive": false,
                 "platforms": ["darwin", "linux"],   // optional: only offer on these OSes
                 "background": false,                // true: returns at once, output streams to Logs › Actions
                 "timeoutSec": 120 }],               // default 120, max 600 (background jobs: 6 hours)
  "folders": [FolderSpec]                        // file transfer areas; see below
}
```

### Requirement

```jsonc
{
  "id": "tool",                                  // used as {{bin.tool}} and {{req.tool.<var>}}
  "label": "Human Name of the Program",
  "candidates": {                                // first path that exists wins, per platform
    "darwin": [{ "path": "/opt/homebrew/bin/tool", "vars": { "share": "/opt/homebrew/share/tool" } }, { "path": "/usr/local/bin/tool" }],
    "linux":  [{ "path": "/usr/bin/tool" }],
    "win32":  [{ "path": "{{env.ProgramFiles}}/Tool/tool.exe" }]
  },
  "install": {                                   // run in order only if no candidate exists
    "darwin": ["brew install tool"],
    "linux":  ["if command -v apt-get >/dev/null; then sudo -n apt-get install -y tool; elif command -v dnf >/dev/null; then sudo -n dnf install -y tool; fi"],
    "win32":  ["winget install --id Vendor.Tool -e --silent --accept-package-agreements --accept-source-agreements"]
  },
  "hint": "What to install by hand if automatic install fails."
}
```

Candidate paths can use template variables (`{{dataDir}}/bin/tool` for a binary the plugin
downloads itself), `*` to match one path segment where the newest version wins
(`C:/Program Files/Java/jdk-2*/bin/java.exe`), and `"@path:tool"` to search the PATH (put it last).
WinGet's portable packages live in `{{env.LOCALAPPDATA}}/Microsoft/WinGet/Links/<tool>.exe`.

Install steps are either shell strings, run through `/bin/sh -c` (macOS, Linux) or PowerShell
(Windows), or `{ "command", "args" }` objects run directly. Shell strings: never prompt for input,
use `sudo -n` (fails instead of asking), quote paths (`"{{dataDir}}/bin"` may contain spaces), and
list Homebrew paths for both Apple silicon (`/opt/homebrew`) and Intel (`/usr/local`). To download a
single binary on any OS, ship a small script and run it with `@node` (see Scripts).

### SettingField: every type the app can draw

Common keys: `key` (camelCase, unique), `label` (Title Case), `type`, `default`, and optionally
`description`, `placeholder`, `group` (section heading; consecutive fields with the same group sit
together), `required`, `visibleIf: { "key": "otherKey", "equals": value }`, and
`restart` (default `true`: a running plugin restarts when this changes; set `false` for settings
that don't need it).

| `type` | Control | `default` | Extra keys |
| --- | --- | --- | --- |
| `string` | One-line text field | `""` | `pattern`, `patternHint` |
| `text` | Multi-line monospace box | `""` (use `\n`) | `rows`, `pattern` |
| `password` | Masked field with show button | `""` | `pattern` |
| `number` | Numeric field | number | `min`, `max`, `step`, `unit` |
| `port` | Numeric field, 1–65535 | number | `min` (use 1024 to avoid admin rights), `max` |
| `slider` | Track slider | number | **`min` and `max` required**, `step`, `unit` |
| `boolean` | On/off switch | `true`/`false` | |
| `select` | Segmented control, one choice | an option value | **`options`: `[{ "label": "Shown", "value": "stored" }]`** |
| `multiselect` | Chips, several choices → array | array of values | **`options`**, `maxItems` |
| `list` | Editable list of strings → array | array of strings | `pattern` (per item), `maxItems`, `placeholder` |
| `email` | Email field | `""` | |
| `url` | http(s) URL field | `""` | |
| `path` | Monospace path field (server path) | `""` | `pattern` |
| `color` | Swatch + hex field | `"#RRGGBB"` | |
| `file` | "Choose File…" upload (end-to-end encrypted) | `""` | `accept` (e.g. `[".pem"]`), `maxFileMB` (default 10) |

A `file` setting's value is the uploaded file name; its absolute path on the server is
`{{files.<key>}}`. Empty until someone uploads one, so wrap uses in `{{#if files.<key>}}…{{/if}}`.

Values are validated on the server. Strings never contain line breaks (except `text`), so a
setting can't inject extra lines into a config file.

### FolderSpec: file transfer (every plugin has it)

```jsonc
{ "id": "site", "label": "Website Files", "root": "{{dataDir}}/site",
  "description": "Shown under the heading.", "accept": [".html", ".css"], "maxFileMB": 50, "download": true }
```

Each folder gets **Upload Files**, **Upload Folder** (keeps sub-folders), **Download** and **Delete**
in the app, all end-to-end encrypted between the user's device and the server. `root` must start
with `{{dataDir}}`, `{{runtimeDir}}` or `{{logsDir}}`. Omit `accept` to allow any file. If you
declare no folders, the plugin still gets one called "Files" at `{{dataDir}}/files`. Use folders for
anything people provide or collect: websites, scripts, models, datasets, backups, exports, configs.

### Scripts: `"command": "@node"`

Any `run`, `stop`, action or install step can use `"command": "@node"` with the script path as the
first argument. EasyServer runs it with its own JavaScript runtime, so it works on every server
without Node installed. Write scripts as ES modules (`.mjs`) using only Node's built-in modules
(`node:fs`, `node:path`, `node:child_process`, `node:net`, `node:crypto`) and global `fetch`.
They must run under both Node 20 and Bun. Every script gets these environment variables:

| Variable | Contents |
| --- | --- |
| `ES_SETTINGS` | JSON of the current settings |
| `ES_BIN` | JSON of resolved requirement paths, e.g. `{"ffmpeg": "/opt/homebrew/bin/ffmpeg"}` |
| `ES_FILES` | JSON of uploaded `file` settings' absolute paths |
| `ES_DATA_DIR` `ES_RUNTIME_DIR` `ES_LOGS_DIR` `ES_PLUGIN_DIR` | The plugin's folders |
| `ES_HOST` | The server's LAN address |

Use a script when the plugin needs logic: watching a folder, talking to an API, choosing flags,
downloading a binary, or wrapping a program so it can be stopped cleanly. A long-running `run`
script should forward SIGTERM to its child process and exit when it does. Scripts print to stdout;
in `run` that becomes the Output log, in actions it becomes the action's result.

### Template variables (manifest strings and `templates` files)

| Variable | Meaning |
| --- | --- |
| `{{pluginDir}}` | Downloaded plugin files (replaced on update; don't write here) |
| `{{runtimeDir}}` | Rendered templates; the process's working directory |
| `{{dataDir}}` | Persistent data, kept across updates |
| `{{logsDir}}` | Logs; stdout and stderr are already captured in `process.log` (shown as "Output") |
| `{{settings.<key>}}` | A setting's value (arrays render comma-joined) |
| `{{files.<key>}}` | Absolute path of a `file` setting's upload |
| `{{bin.<id>}}` / `{{req.<id>.<var>}}` | Resolved program path / its candidate's `vars` |
| `{{host}}` `{{hostname}}` | LAN IP address / computer name |
| `{{platform}}` `{{arch}}` | `darwin`·`linux`·`win32` / `arm64`·`x64` |
| `{{isMac}}` `{{isLinux}}` `{{isWin}}` `{{isArm}}` `{{isX64}}` | Booleans for conditionals |
| `{{home}}` | The user's home folder |
| `{{env.NAME}}` | Environment variable |

All paths use forward slashes on every platform.

Template syntax (no code execution):

- `{{value}}`, with filters `{{list|space}}` (space-joined), `{{list|lines}}` (one per line),
  `{{list|quote}}` (each quoted), `{{value|json}}`
- `{{#if key}}…{{/if}}`, `{{#unless key}}…{{/unless}}` (empty strings and empty lists are false)
- `{{#if key=value}}…{{/if}}` compares as text, e.g. `{{#if settings.mode=advanced}}`
- `{{#each settings.list}}…{{this}}…{{/each}}` repeats per item
- In `args` and `env`, a value that renders to an empty string is dropped, so a flag can be
  switched on and off: `"{{#if settings.readOnly}}--read-only{{/if}}"`

## Rules the plugin must follow

1. `run.command` must stay in the **foreground** and keep running (no daemonizing, no `&`, no
   `service start`). The agent supervises it, captures its output and stops it with SIGTERM
   (Windows: kills the process tree). If the program has a "foreground" or "no-daemon" flag, use it.
2. `run.command` and `actions[].command` are executed directly, **not through a shell**. Call the
   program directly, or use an `@node` script when you need logic. For a program that keeps
   running after a signal (containers, VMs, game servers that should save first), add `run.stop`.
   Use `platformRun` or an action's `platforms` when commands differ by OS.
3. Never write outside `{{runtimeDir}}`, `{{dataDir}}` and `{{logsDir}}`. Point every config, pid,
   socket, cache and log path at those folders, so the plugin never touches a system-wide install.
4. Default ports must be **1024 or higher** and should be settings of type `port`.
5. Prefer a **private config file** generated from a template over editing system config.
6. Give people real control: put every value a user might reasonably change into `settings`, group
   them with `group`, describe anything non-obvious, use `visibleIf` for advanced options, and use the
   most specific type (`port`, `slider`, `select`, `list`, `file`, `password`) rather than `string`.
7. Add a `health` check whenever the program listens on a port, and `links` for anything with a web UI.
8. Add `actions` for useful one-off commands (check config, show version, clear cache, run backup).
   Mark ones that delete data with `"destructive": true` and a `confirm` message. Anything that can
   take more than a minute (builds, backups, downloads) gets `"background": true`.
9. Declare `folders` for every kind of file people would upload or want to download.
10. Use Title Case for labels and buttons. Keep the description factual; no marketing superlatives.

## Complete example

### FILE: easyserver.plugin.json
```json
{
  "schema": 1,
  "id": "dev.easyserver.static",
  "name": "Static Site",
  "version": "1.0.0",
  "developer": "EasyServer",
  "subtitle": "Publish a folder as a website",
  "description": "Serves the files in Website Files over HTTP using Python's built-in web server.\n\nUpload a folder with an index.html and it's live on your network.",
  "category": "web-servers",
  "icon": "icon.svg",
  "platforms": ["darwin", "linux", "win32"],
  "files": ["icon.svg", "site/index.html"],
  "requires": [
    {
      "id": "python",
      "label": "Python 3",
      "candidates": {
        "darwin": [{ "path": "/opt/homebrew/bin/python3" }, { "path": "/usr/local/bin/python3" }, { "path": "/usr/bin/python3" }],
        "linux": [{ "path": "/usr/bin/python3" }],
        "win32": [{ "path": "{{env.LOCALAPPDATA}}/Programs/Python/Python312/python.exe" }, { "path": "{{env.LOCALAPPDATA}}/Programs/Python/Python313/python.exe" }]
      },
      "install": {
        "darwin": ["command -v brew >/dev/null && brew install python"],
        "linux": ["command -v apt-get >/dev/null && sudo -n apt-get install -y python3"],
        "win32": ["winget install --id Python.Python.3.12 -e --silent --accept-package-agreements --accept-source-agreements"]
      },
      "hint": "Install Python 3 from python.org, then press Install again."
    }
  ],
  "settings": [
    { "key": "port", "label": "Port", "type": "port", "default": 8000, "min": 1024, "group": "Network" },
    { "key": "bind", "label": "Who Can Connect", "type": "select", "default": "0.0.0.0", "group": "Network",
      "options": [{ "label": "Anyone on My Network", "value": "0.0.0.0" }, { "label": "Only This Computer", "value": "127.0.0.1" }] }
  ],
  "seed": [{ "src": "site/index.html", "dest": "site/index.html" }],
  "run": { "command": "{{bin.python}}", "args": ["-m", "http.server", "{{settings.port}}", "--bind", "{{settings.bind}}", "--directory", "{{dataDir}}/site"] },
  "health": { "type": "http", "target": "http://127.0.0.1:{{settings.port}}/" },
  "links": [{ "label": "Open Website", "url": "http://{{host}}:{{settings.port}}/" }],
  "actions": [{ "id": "version", "label": "Show Python Version", "command": "{{bin.python}}", "args": ["--version"] }],
  "folders": [{ "id": "site", "label": "Website Files", "root": "{{dataDir}}/site", "description": "Everything here is published." }]
}
```

### FILE: site/index.html
```html
<!doctype html><html><head><meta charset="utf-8"><title>It works</title></head><body><h1>It works.</h1></body></html>
```

### FILE: icon.svg
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#34C759"/><stop offset="1" stop-color="#1E8E3E"/></linearGradient></defs><rect width="256" height="256" rx="56" fill="url(#g)"/><g fill="none" stroke="#fff" stroke-width="11" stroke-linecap="round" stroke-linejoin="round"><rect x="62" y="70" width="132" height="116" rx="14"/><path d="M62 102h132M88 134h48M88 158h80"/></g></svg>
```

### NOTES
- Needs Python 3; installed automatically where a package manager is available.
- Listens on port 8000 by default.

---

## The plugin I want

Describe it here, for example: *"A voxel game server using the open-source
Luanti engine, with settings for world name, max players, creative mode and a server password, a
folder for mods, and a Backups folder I can download from."*

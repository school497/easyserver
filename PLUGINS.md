# Writing an EasyServer plugin

A plugin is a folder with an `easyserver.plugin.json` manifest and the files it lists. Put it in a
GitHub repository (the repo root or any sub-folder), then add its URL to the `plugin_sources` table.
The store reads the manifest straight from GitHub, and the server downloads exactly the files in
`files`, nothing else. Everything the app shows and every control it offers comes from the manifest.

See `plugins/apache/` for a complete, working example.

**Fastest way to make one:** paste [PLUGIN_PROMPT.md](PLUGIN_PROMPT.md) into any LLM, describe the
plugin at the bottom, and it writes every file. That file is also the complete reference for every
field type and template feature.

## The manifest

```jsonc
{
  "schema": 1,
  "id": "dev.yourname.myplugin",        // reverse-DNS, unique, never changes
  "name": "My Plugin",
  "version": "1.0.0",                    // semver
  "developer": "Your Name",
  "subtitle": "One line for store cards",
  "description": "Paragraphs separated by a blank line.\n\nShown on the store page.",
  "category": "web-servers",             // web-servers | computing | storage | networking | developer-tools | other
  "icon": "icon.svg",                    // png or svg, square, rendered with rounded corners
  "platforms": ["darwin", "linux", "win32"],
  "files": ["icon.svg", "templates/app.conf"],   // everything the server downloads

  "requires": [ ... ],                   // binaries to find or install
  "settings": [ ... ],                   // generates the Settings form
  "templates": [ ... ],                  // config files rendered before every start
  "seed": [ ... ],                       // files copied into the data folder once
  "run": { "command": "{{bin.mytool}}", "args": ["--config", "{{runtimeDir}}/app.conf"], "env": {} },
  "health": { "type": "http", "target": "http://127.0.0.1:{{settings.port}}/", "intervalSec": 30 },
  "logs": [{ "id": "error", "label": "Error Log", "path": "{{logsDir}}/error.log" }],
  "links": [{ "label": "Open Website", "url": "http://{{host}}:{{settings.port}}/" }],
  "actions": [{ "id": "check", "label": "Check Config", "command": "{{bin.mytool}}", "args": ["-t"], "confirm": "optional confirmation text", "destructive": false }],
  "folders": [{ "id": "site", "label": "Website Files", "root": "{{dataDir}}/site", "accept": [".html", ".css"], "maxFileMB": 50 }]
}
```

### Folders the agent gives every plugin

| Variable | What it is |
| --- | --- |
| `{{pluginDir}}` | The downloaded plugin files (replaced on update) |
| `{{runtimeDir}}` | Rendered templates; the process's working directory |
| `{{dataDir}}` | Your plugin's persistent data (kept across updates) |
| `{{logsDir}}` | Logs. `process.log` captures stdout/stderr automatically |

Also available: `{{settings.<key>}}`, `{{files.<key>}}`, `{{bin.<requirementId>}}`, `{{req.<requirementId>.<var>}}`,
`{{host}}` (LAN IP), `{{hostname}}`, `{{platform}}`, `{{arch}}`, `{{isWin}}`, `{{isMac}}`, `{{isLinux}}`,
`{{env.NAME}}`.

### `requires`

```json
{
  "id": "httpd",
  "label": "Apache HTTP Server",
  "candidates": {
    "darwin": [{ "path": "/opt/homebrew/opt/httpd/bin/httpd", "vars": { "modules": "/opt/homebrew/opt/httpd/lib/httpd/modules" } }],
    "linux": [{ "path": "/usr/sbin/apache2", "vars": { "modules": "/usr/lib/apache2/modules" } }]
  },
  "install": { "linux": ["sudo -n apt-get install -y apache2"] },
  "hint": "Shown if it still can't be found."
}
```

The first candidate that exists wins. Candidates can use template variables, `*` to match one
path segment (newest match wins) and `@path:name` to search PATH. If none exists, the `install` steps
for the platform run in order (shell strings through `/bin/sh` or PowerShell, or `{command, args}`
objects, including `@node` scripts), output goes to the Install log, then candidates are checked again.

### `settings`

Fifteen field types, each drawn as its own control in the app: `string`, `text` (multi-line),
`password` (masked), `number`, `port`, `slider`, `boolean`, `select`, `multiselect`, `list`,
`email`, `url`, `path`, `color`, and `file` (people upload a file; its path is `{{files.<key>}}`).

Every field can also have `description`, `placeholder`, `group` (section heading), `required`,
`visibleIf` (show only when another setting has a value), `pattern` + `patternHint`, and `restart`.
Numbers take `min`, `max`, `step`, `unit`; lists take `maxItems`; files take `accept` and `maxFileMB`.
All values are validated again on the server; only `text` may contain line breaks.
Full table: [PLUGIN_PROMPT.md › SettingField](PLUGIN_PROMPT.md).

### `run`

The command runs directly, never through a shell, so arguments can't be injected. The process must
stay in the foreground. The agent stops it with SIGTERM (Windows: kills the process tree), then
SIGKILL after 10 seconds. Add `run.stop` for a graceful shutdown command that runs first (the
Docker plugin uses it for `docker compose stop`; Minecraft uses it to save the world), `run.cwd` to
start somewhere other than `{{runtimeDir}}`, and `platformRun` when a platform needs other arguments.

### Scripts

`"command": "@node"` runs a `.mjs` script from the plugin with EasyServer's own runtime (Electron in
the desktop server app, Bun in the CLI), so no Node install is needed. Scripts receive the settings,
resolved binaries and folders as `ES_*` environment variables. `plugins/_shared/lib.mjs` has helpers
for running commands, supervising a child process, downloading files and starting Docker; the
bundled plugins each ship a copy.

### Actions

Besides `command`/`args`/`confirm`/`destructive`, actions take `platforms` (only offered on those
OSes), `background` (returns immediately; output streams to Logs › Actions) and `timeoutSec`.

### `folders` (file transfer for every plugin)

Each folder gets **Upload Files**, **Upload Folder**, **Download** and **Delete** in the app, end-to-end
encrypted both ways (uploads are sealed to the server's key; each download is sealed to a one-time
key the requesting window makes). `root` must start with `{{dataDir}}`, `{{runtimeDir}}` or
`{{logsDir}}`; `accept` limits extensions; `"download": false` hides downloads. A plugin that
declares no folders still gets one: **Files** at `{{dataDir}}/files`.

### Templates

`{{value}}`, filters `|space` `|lines` `|quote` `|json`, `{{#if}}`, `{{#unless}}`,
`{{#if key=value}}`, and `{{#each list}}…{{this}}…{{/each}}`. There's no code execution.

## Security notes

- Only URLs listed (and enabled) in `plugin_sources` can be installed. You curate that table.
- A plugin runs commands on the server as the user running EasyServer. Review plugins before listing them.
- Paths in manifests must be relative and can't contain `..`; the agent re-checks every path at runtime.

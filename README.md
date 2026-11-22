# EasyServer

Turn any computer into a server you control from anywhere.

| Piece | What it is |
| --- | --- |
| **EasyServer** (`apps/client`) | Desktop app you control servers from. Pill-shaped server picker at the foot of the sidebar. |
| **EasyServer Server** (`apps/server`) | Desktop app you install on the machine that becomes the server. Runs the agent and stays in the tray / menu bar. |
| **`easyserver` CLI** (`packages/agent`) | Same agent for headless machines: macOS, Linux, Windows. |
| **Supabase** (`supabase/migrations`) | The single database for remote control, pairing, status, and the plugin store. |
| **Apache plugin** (`plugins/apache`) | Example plugin. Upload the folder to GitHub and list it in `plugin_sources`. |
| **[PLUGIN_PROMPT.md](PLUGIN_PROMPT.md)** | Paste into any LLM with a description of the plugin you want; it writes every file. |

Both apps share one React Native UI (`packages/ui`) rendered with react-native-web inside Electron,
which is what makes one codebase ship as `.exe`, Apple-silicon and Intel `.dmg`, and Linux AppImage.
Five sections: **Home** (run time, up rate, resources), **Discover** (plugin store), **Plugins**,
**Search** (searches everything and scrolls to it), **Settings**. Light and dark follow the system.

## How it works

```
 Client app ──insert command──▶  Supabase  ◀──realtime / poll── Agent (server app or CLI)
            ◀──realtime state──  (RLS)      ──status, plugins──▶
```

- Nothing connects to the server directly and it needs no open ports: the client writes a row in
  `commands`, the agent executes it and writes the result back. Row Level Security limits every
  table to the agent that owns the server and the clients that paired with it.
- **Pairing**: the server names itself and gets a 6-letter code (15-minute expiry, no I/O, 10 wrong
  guesses per hour per account). Setup can't finish until a client claims it.
- **Two-factor**: once a client account turns on 2FA, the database refuses that account's server
  access until the session is verified (`aal2`), not just the UI.
- **File transfer** is built into every plugin (upload and download per folder, plus `file`
  settings) and uses end-to-end encryption instead of peer-to-peer. P2P (WebRTC) needs both
  machines online at once and fails behind many routers; this works through any network and is just
  as private: each file is encrypted on the client with the server's public key (ECDH P-256 →
  HKDF-SHA-256 → AES-256-GCM, bound to the server id and file path), stored as ciphertext in a private
  Storage bucket, decrypted and checksum-verified by the agent, then deleted. Downloads run the
  same way in reverse, sealed to a one-time key the requesting window creates. Compare the
  **Encryption Key** fingerprint in Settings on both sides to be sure you're talking to your server.
- **Plugin store**: you hand-add GitHub links to `plugin_sources`. Opening Discover renders the cached
  store instantly, then re-reads the links from Supabase and each manifest from GitHub in parallel.
  Trending is computed on the device from 30 days of aggregated install counts.

## Set up

1. **Supabase project.** Create one, then run `supabase/migrations/0001_easyserver.sql` in the SQL
   editor (or `supabase db push`). Turn on **Authentication › Sign In / Providers › Allow anonymous
   sign-ins**, and enable **TOTP** under Multi-Factor if you want 2FA.
2. **Keys.** Copy `.env.example` to `.env` and fill in the project URL and anon/publishable key.
   These are baked into the apps and CLI at build time.
3. **Plugins.** Push `plugins/apache` to GitHub, then add a row to `plugin_sources` (Table Editor),
   e.g. `https://github.com/you/easyserver-plugins/tree/main/apache`. See [PLUGINS.md](PLUGINS.md).
4. **Build.**

```bash
npm install
```

```bash
npm run dist:client -- --win      # or --mac / --linux
```

```bash
npm run dist:server -- --win
```

```bash
npm run build:cli                 # all five CLI binaries into dist/cli
```

macOS DMGs must be built on a Mac. Easiest: push to GitHub, add `SUPABASE_URL` and
`SUPABASE_ANON_KEY` as repository secrets, and run the **Release** workflow; it builds every
installer and CLI binary (push a `v1.0.0` tag to attach them to a GitHub Release).

The Mac builds are ad-hoc signed, not notarized: open them the first time with right-click › Open
(or `xattr -cr "/Applications/EasyServer.app"`). Add a Developer ID in `electron-builder.yml` to notarize.

## Use

**On the server**: install EasyServer Server, name it, and keep the code on screen. Or on a headless box:

```bash
easyserver setup
```

```bash
easyserver service install
```

**On your computer**: open EasyServer, click the pill at the bottom of the sidebar › **Add Server…**,
type the code. The server appears and is selected.

## Updates

Both apps and the CLI update themselves from this repository's GitHub Releases (`latest.json`
lists every build with its SHA-512). In the apps, choose when to check in Settings › Updates:
when the app opens, every hour, every 6 hours, every day, or never. On the CLI:

```bash
easyserver updates 6h
```

```bash
easyserver update
```

Before an update installs on a server, EasyServer records which plugins are running and starts
exactly those again afterwards, even if Start Plugins Automatically is off.

To publish a release, push a version tag; the Release workflow builds everything and publishes it:

```bash
git tag v1.2.0 && git push origin v1.2.0
```

## Develop

```bash
npm run dev:client                # Electron + live reload
```

```bash
npm run web -w @easyserver/client -- --open "/?demo"   # browser preview with demo data
```

```bash
node scripts/test/run.mjs         # offline tests: crypto, templates, plugin lifecycle
```

The UI uses only React Native primitives (`View`, `Text`, `Pressable`, `ScrollView`, `Animated`),
so it can move to react-native-macos / react-native-windows or a phone later.

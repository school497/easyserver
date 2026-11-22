import React, { useEffect, useState } from 'react';
import { Image, View } from 'react-native';
import { APP_VERSION, UPDATE_MODES, fingerprint, isOnline, type UpdateMode, type UpdateStatus } from '@easyserver/core';
import { Page, Target } from '../components/Page';
import { Button, Card, Field, Row, SectionHeader, Segmented, Separator, Spinner, T, Toggle } from '../components/primitives';
import { Confirm, Sheet, SheetButtons } from '../components/Modal';
import { CodeDisplay } from '../components/CodeInput';
import { backend, run, selectedServer, store, toast, useApp } from '../state';
import { clearCatalogCache, useCatalog } from '../catalog';
import { timeAgo } from '../platform';
import type { Member } from '../backend/types';

function Section({ id, title, children, footer }: { id: string; title: string; children: React.ReactNode; footer?: string }) {
  return (
    <Target id={id} style={{ marginBottom: 28 }}>
      <SectionHeader title={title} />
      <Card style={{ paddingVertical: 6 }}>{children}</Card>
      {footer ? (
        <T v="callout" color="secondary" style={{ marginTop: 6, paddingHorizontal: 4 }}>
          {footer}
        </T>
      ) : null}
    </Target>
  );
}

export function SettingsScreen() {
  const mode = backend().mode;
  return (
    <Page title="Settings" maxWidth={760}>
      {mode === 'client' ? <ClientSettings /> : <ServerSettings />}
      <UpdatesSection />
      <StoreSection />
      <Section id="settings.about" title="About">
        <Row label="EasyServer" value={`Version ${APP_VERSION}${backend().demo ? ' (demo data)' : ''}`} last />
      </Section>
    </Page>
  );
}

/* ───────────── Shared pieces ───────────── */

function ServerNameRow() {
  const server = useApp(selectedServer);
  const [name, setName] = useState(server?.name ?? '');
  const busy = useApp((s) => s.busy['server:rename']);
  useEffect(() => setName(server?.name ?? ''), [server?.name]);
  if (!server) return null;
  const dirty = name.trim() && name.trim() !== server.name;
  const save = () => run('server:rename', 'Renaming', () => backend().send('server.rename', { name: name.trim() })).then((r) => r && toast('Server renamed.'));
  return (
    <Target id="settings.server" radius={8}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingTop: 8 }}>
        <View style={{ flex: 1 }}>
          <Field label="Server Name" value={name} onChangeText={setName} maxLength={64} onSubmitEditing={() => dirty && save()} />
        </View>
        <View style={{ marginBottom: 12 }}>
          <Button title="Rename" onPress={save} disabled={!dirty} loading={!!busy} />
        </View>
      </View>
    </Target>
  );
}

function AutoStartRow({ disabled }: { disabled?: boolean }) {
  const server = useApp(selectedServer);
  const on = server?.settings?.autoStartPlugins !== false;
  return (
    <Target id="settings.autostart" radius={8}>
      <Row label="Start Plugins Automatically">
        <Toggle
          label="Start plugins automatically when the server starts"
          value={on}
          disabled={disabled}
          onValueChange={(v) => run('server:settings', 'Saving', () => backend().send('server.settings', { settings: { autoStartPlugins: v } }))}
        />
      </Row>
    </Target>
  );
}

function KeyRow() {
  const server = useApp(selectedServer);
  const [fp, setFp] = useState<string | null>(null);
  useEffect(() => {
    if (backend().keyFingerprint) backend().keyFingerprint!().then(setFp);
    else if (server?.public_key && (server.public_key as any).x !== 'demo') fingerprint(server.public_key).then(setFp);
    else setFp(server?.public_key ? '3F2A 91C0 7B44 E1D8' : null);
  }, [server?.public_key]);
  return (
    <Target id="settings.encryption" radius={8}>
      <Row label="Encryption Key" value={fp ?? 'Not published yet'} last />
    </Target>
  );
}

/** Settings › Updates (desktop apps only). */
function UpdatesSection() {
  const shell = (globalThis as any).easyserverShell?.updates;
  const [info, setInfo] = useState<{ mode: UpdateMode; status: UpdateStatus; version: string } | null>(null);
  useEffect(() => {
    if (!shell) return;
    shell.get().then(setInfo);
    return shell.onStatus((status: UpdateStatus) => setInfo((i) => (i ? { ...i, status } : i)));
  }, []);
  if (!shell) return null;
  if (!info) return null;
  const st = info.status;
  const text =
    st.state === 'checking'
      ? 'Checking…'
      : st.state === 'downloading'
        ? `Downloading ${st.version} · ${Math.round((st.progress ?? 0) * 100)}%`
        : st.state === 'ready'
          ? `Version ${st.version} is ready`
          : st.state === 'installing'
            ? `Installing ${st.version}…`
            : st.state === 'up-to-date'
              ? `Up to date${st.lastChecked ? ` · checked ${timeAgo(st.lastChecked)}` : ''}`
              : st.state === 'error' || st.state === 'unsupported'
                ? st.error ?? 'Couldn’t check for updates.'
                : 'Not checked yet';
  const busy = st.state === 'checking' || st.state === 'downloading' || st.state === 'installing';
  return (
    <Section
      id="settings.updates"
      title="Updates"
      footer={
        backend().mode === 'server'
          ? 'Updates install automatically. Plugins that were running start again right after.'
          : 'Updates download in the background and install when EasyServer restarts.'
      }
    >
      <View style={{ paddingVertical: 8 }}>
        <T v="headline" style={{ marginBottom: 8 }}>
          Check for Updates
        </T>
        <Segmented
          label="Check for updates"
          value={info.mode}
          options={UPDATE_MODES.map((m) => ({ label: m.label, value: m.value }))}
          onChange={(mode) => shell.setMode(mode).then((m: UpdateMode) => setInfo((i) => (i ? { ...i, mode: m } : i)))}
        />
      </View>
      <Separator />
      <Row label={`EasyServer ${info.version}`} last>
        <T color={st.state === 'error' ? 'redText' : 'secondary'} numberOfLines={2} style={{ flexShrink: 1, textAlign: 'right' }}>
          {text}
        </T>
        <Button title="Check Now" onPress={() => shell.check()} loading={busy} />
      </Row>
    </Section>
  );
}

function StoreSection() {
  const cat = useCatalog();
  return (
    <Section id="settings.store" title="Plugin Store" footer="Discover opens from this cache, then checks GitHub for changes.">
      <Row label={`${cat.items.length} plugins cached${cat.fetchedAt ? `, updated ${timeAgo(new Date(cat.fetchedAt).toISOString())}` : ''}`} last>
        <Button title="Clear Cache" onPress={() => clearCatalogCache().then(() => toast('Plugin store refreshed.'))} loading={cat.loading} />
      </Row>
    </Section>
  );
}

/* ───────────── Client ───────────── */

function ClientSettings() {
  const server = useApp(selectedServer);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const online = isOnline(server);
  return (
    <>
      {server ? (
        <Section id="settings.serverSection" title="Current Server" footer="If this key matches the one in the server’s Settings, only that server can read files you upload.">
          <ServerNameRow />
          <Row label="Status" value={online ? 'Online' : `Offline, last seen ${timeAgo(server.last_seen_at)}`} />
          <AutoStartRow disabled={!online} />
          <KeyRow />
        </Section>
      ) : null}
      {server ? (
        <Target id="settings.remove" style={{ marginBottom: 28 }}>
          <Card style={{ paddingVertical: 6 }}>
            <Row label={`Remove ${server.name} from this device`} last>
              <Button kind="destructive" title="Remove…" onPress={() => setConfirmLeave(true)} />
            </Row>
          </Card>
          {confirmLeave ? (
            <Confirm
              title={`Remove ${server.name}?`}
              message="The server and its plugins keep running. To add it again, you’ll need a new code from the server."
              confirmLabel="Remove"
              onCancel={() => setConfirmLeave(false)}
              onConfirm={() => {
                setConfirmLeave(false);
                run('leave', 'Removing', () => backend().leave!(server.id));
              }}
            />
          ) : null}
        </Target>
      ) : null}
    </>
  );
}

/* ───────────── Server ───────────── */

function ServerSettings() {
  const b = backend();
  const server = useApp(selectedServer);
  const [members, setMembers] = useState<Member[] | null>(null);
  const [code, setCode] = useState<{ code: string; expiresAt: string } | null>(null);
  const [openAtLogin, setOpenAtLogin] = useState<boolean | null>(null);
  const [dataDir, setDataDir] = useState<string | null>(null);
  const [revoke, setRevoke] = useState<Member | null>(null);
  const [reset, setReset] = useState(false);

  const loadMembers = () => b.members!().then(setMembers).catch(() => setMembers([]));
  useEffect(() => {
    loadMembers();
    b.getOpenAtLogin!().then(setOpenAtLogin);
  }, []);
  useEffect(() => {
    if (!code) return;
    const t = setInterval(loadMembers, 3000);
    return () => clearInterval(t);
  }, [code]);

  return (
    <>
      <Section id="settings.serverSection" title="This Server" footer="Clients show this key in their Settings. When they match, only this computer can read files they upload.">
        <ServerNameRow />
        <Row label="Server ID" value={server?.id ?? '—'} />
        <KeyRow />
      </Section>

      <Section id="settings.clients" title="Paired Clients">
        {members == null ? (
          <View style={{ paddingVertical: 10 }}>
            <Spinner />
          </View>
        ) : (
          members.map((m, i) => (
            <Row key={m.user_id} label={`Client ${m.user_id.slice(0, 8).toUpperCase()}`}>
              <T color="secondary">paired {timeAgo(m.created_at)}</T>
              <Button small title="Revoke…" kind="destructive" onPress={() => setRevoke(m)} />
            </Row>
          ))
        )}
        <Row label="Add another device" last>
          <Button kind="primary" title="Pair a Client…" onPress={() => run('pair', 'Creating code', () => b.newPairingCode!()).then((c) => c && setCode(c))} />
        </Row>
      </Section>

      <Section id="settings.startup" title="Startup">
        <Row label="Open at Login">
          {openAtLogin == null ? null : (
            <Toggle
              label="Open EasyServer Server at login"
              value={openAtLogin}
              onValueChange={(v) => {
                setOpenAtLogin(v);
                b.setOpenAtLogin!(v);
              }}
            />
          )}
        </Row>
        <AutoStartRow />
        <Target id="settings.data" radius={8}>
          <Row label="Data Folder" last>
            {dataDir ? (
              <T color="secondary" selectable numberOfLines={1} style={{ flexShrink: 1 }}>
                {dataDir}
              </T>
            ) : null}
            <Button title="Show in Folder" onPress={() => b.revealDataFolder!().then(setDataDir)} />
          </Row>
        </Target>
      </Section>

      <Target id="settings.cli" style={{ marginBottom: 28 }}>
        <SectionHeader title="Command-Line Tool" />
        <Card>
          <T color="secondary" style={{ marginBottom: 8 }}>
            Use the easyserver command on computers without a display. It shares this server’s identity, so run it or this app, but not both.
          </T>
          <T selectable style={{ fontFamily: 'ui-monospace, Menlo, Consolas, monospace' }}>
            easyserver setup{'\n'}easyserver start{'\n'}easyserver service install
          </T>
        </Card>
      </Target>

      <Target id="settings.reset" style={{ marginBottom: 28 }}>
        <Card style={{ paddingVertical: 6 }}>
          <Row label="Delete this server from EasyServer" last>
            <Button kind="destructive" title="Reset Server…" onPress={() => setReset(true)} />
          </Row>
        </Card>
      </Target>

      {code ? (
        <Sheet title="Pair a Client" message="On the other device, choose Add Server from the server menu and enter this code." onClose={() => setCode(null)}>
          <CodeDisplay code={code.code} />
          <T v="callout" color="secondary" style={{ textAlign: 'center', marginTop: 12 }}>
            Expires at {new Date(code.expiresAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
          </T>
          <SheetButtons>
            <Button title="Done" kind="primary" onPress={() => setCode(null)} />
          </SheetButtons>
        </Sheet>
      ) : null}
      {revoke ? (
        <Confirm
          title="Revoke This Client?"
          message="That device loses access right away. You can pair it again with a new code."
          confirmLabel="Revoke"
          onCancel={() => setRevoke(null)}
          onConfirm={() => {
            const m = revoke;
            setRevoke(null);
            run('revoke', 'Revoking', () => b.revoke!(m.user_id)).then(loadMembers);
          }}
        />
      ) : null}
      {reset ? (
        <Confirm
          title="Reset This Server?"
          message="Every paired client loses access, and you’ll name and pair this computer again. Plugins stop, but their files stay here."
          confirmLabel="Reset Server"
          onCancel={() => setReset(false)}
          onConfirm={() => {
            setReset(false);
            run('reset', 'Resetting', () => b.resetServer!());
          }}
        />
      ) : null}
    </>
  );
}

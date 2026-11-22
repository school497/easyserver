import React, { useEffect, useState } from 'react';
import { Image, View } from 'react-native';
import { APP_VERSION, fingerprint, isOnline } from '@easyserver/core';
import { Page, Target } from '../components/Page';
import { Button, Card, Field, Row, SectionHeader, Spinner, T, Toggle } from '../components/primitives';
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
      <AccountSection />
      <TwoFactorSection />
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

function AccountSection() {
  const account = useApp((s) => s.account);
  const [form, setForm] = useState<null | 'save' | 'signin'>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mfaCode, setMfaCode] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmOut, setConfirmOut] = useState(false);
  const b = backend();
  const close = () => (setForm(null), setErr(null), setPassword(''), setMfaCode(null));

  const submit = async () => {
    setErr(null);
    setBusy(true);
    try {
      if (mfaCode != null) {
        await b.verifySignInMfa!(mfaCode);
        close();
      } else if (form === 'save') {
        toast(await b.signUpWithEmail!(email.trim(), password));
        close();
      } else {
        const r = await b.signIn!(email.trim(), password);
        if (r === 'mfa') setMfaCode('');
        else close();
      }
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section
      id="settings.account"
      title="Account"
      footer={account?.isAnonymous ? 'This device uses a guest account. Add an email to sign in on other devices and to turn on two-factor authentication.' : undefined}
    >
      <Row label="Signed In As" value={account ? (account.isAnonymous ? 'Guest' : account.email ?? 'Account') : '—'} />
      <Row label={account?.isAnonymous ? 'Email' : 'This Device'} last>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {account?.isAnonymous ? <Button kind="primary" title="Add Email…" onPress={() => setForm('save')} /> : null}
          {account?.isAnonymous ? <Button title="Sign In…" onPress={() => setForm('signin')} /> : <Button title="Sign Out…" onPress={() => setConfirmOut(true)} />}
        </View>
      </Row>
      {form ? (
        <Sheet
          title={mfaCode != null ? 'Enter Your Verification Code' : form === 'save' ? 'Add an Email Address' : 'Sign In'}
          message={
            mfaCode != null
              ? 'Open your authenticator app and enter the six-digit code for EasyServer.'
              : form === 'save'
                ? 'You’ll get a message to confirm it. Your servers stay with this account.'
                : 'Signing in replaces the guest account on this device. Servers paired to the guest account will no longer appear.'
          }
          onClose={close}
        >
          {mfaCode != null ? (
            <Field label="Code" value={mfaCode} onChangeText={(t) => setMfaCode(t.replace(/\D/g, '').slice(0, 6))} autoFocus autoComplete="one-time-code" inputMode="numeric" onSubmitEditing={submit} error={err} />
          ) : (
            <>
              <Field label="Email" value={email} onChangeText={setEmail} autoFocus autoComplete="email" inputMode="email" autoCapitalize="none" />
              <Field
                label="Password"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoComplete={form === 'save' ? 'new-password' : 'current-password'}
                hint={form === 'save' ? 'At least 8 characters.' : undefined}
                onSubmitEditing={submit}
                error={err}
              />
            </>
          )}
          <SheetButtons>
            <Button title="Cancel" onPress={close} />
            <Button
              kind="primary"
              title={mfaCode != null ? 'Verify' : form === 'save' ? 'Add Email' : 'Sign In'}
              onPress={submit}
              loading={busy}
              disabled={mfaCode != null ? mfaCode.length !== 6 : !email.includes('@') || password.length < (form === 'save' ? 8 : 1)}
            />
          </SheetButtons>
        </Sheet>
      ) : null}
      {confirmOut ? (
        <Confirm
          title="Sign Out?"
          message="Your servers disappear from this device until you sign in again. They keep running."
          confirmLabel="Sign Out"
          onCancel={() => setConfirmOut(false)}
          onConfirm={() => {
            setConfirmOut(false);
            run('signout', 'Signing out', () => b.signOut!());
          }}
        />
      ) : null}
    </Section>
  );
}

function TwoFactorSection() {
  const account = useApp((s) => s.account);
  const [enroll, setEnroll] = useState<{ factorId: string; qr: string; secret: string } | null>(null);
  const [code, setCode] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmOff, setConfirmOff] = useState(false);
  const b = backend();
  const enabled = !!account?.mfa?.verified;

  const start = async () => {
    setBusy(true);
    try {
      setEnroll(await b.enrollMfa!());
    } catch (e: any) {
      toast(e?.message ?? String(e), 'error');
    } finally {
      setBusy(false);
    }
  };
  const verify = async () => {
    setBusy(true);
    setErr(null);
    try {
      await b.verifyMfa!(enroll!.factorId, code);
      setEnroll(null);
      setCode('');
      toast('Two-factor authentication is on.');
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section id="settings.2fa" title="Two-Factor Authentication" footer="With this on, you’ll need a code from your authenticator app to manage servers.">
      <Row label={enabled ? 'On' : account?.isAnonymous ? 'Add an email first' : 'Off'} last>
        {enabled ? (
          <Button title="Turn Off…" onPress={() => setConfirmOff(true)} />
        ) : (
          <Button kind="primary" title="Turn On…" onPress={start} disabled={account?.isAnonymous} loading={busy && !enroll} />
        )}
      </Row>
      {enroll ? (
        <Sheet title="Set Up Two-Factor Authentication" message="Scan this with an authenticator app, then enter the six-digit code it shows." onClose={() => setEnroll(null)}>
          <View style={{ alignItems: 'center', marginBottom: 12 }}>
            {enroll.qr ? <Image accessibilityLabel="QR code for your authenticator app" source={{ uri: enroll.qr }} style={{ width: 180, height: 180, backgroundColor: '#fff', borderRadius: 8 }} /> : null}
            <T v="caption" color="secondary" selectable style={{ marginTop: 8 }}>
              Or enter this key: {enroll.secret}
            </T>
          </View>
          <Field label="Code" value={code} onChangeText={(t) => setCode(t.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" onSubmitEditing={verify} error={err} />
          <SheetButtons>
            <Button title="Cancel" onPress={() => setEnroll(null)} />
            <Button kind="primary" title="Turn On" onPress={verify} disabled={code.length !== 6} loading={busy} />
          </SheetButtons>
        </Sheet>
      ) : null}
      {confirmOff ? (
        <Confirm
          title="Turn Off Two-Factor Authentication?"
          message="Anyone with your password could then manage your servers."
          confirmLabel="Turn Off"
          onCancel={() => setConfirmOff(false)}
          onConfirm={() => {
            setConfirmOff(false);
            run('mfa', 'Turning off', () => b.disableMfa!(account!.mfa!.factorId));
          }}
        />
      ) : null}
    </Section>
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

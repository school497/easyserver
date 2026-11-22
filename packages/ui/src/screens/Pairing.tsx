import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Button, Field, Spinner, T } from '../components/primitives';
import { Sheet, SheetButtons } from '../components/Modal';
import { CodeDisplay, CodeInput } from '../components/CodeInput';
import { backend, store, toast } from '../state';
import { useTheme } from '../theme';
import type { SetupState } from '../backend/types';

/** Client: "Add Server" sheet. On success the server is added and selected, with no animation. */
export function AddServerSheet() {
  const [code, setCode] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const close = () => store.set({ addServerOpen: false });
  const submit = async () => {
    if (code.length !== 6 || busy) return;
    setBusy(true);
    setErr(null);
    try {
      await backend().claimCode!(code);
      close();
      const s = store.get().servers.find((x) => x.id === store.get().selectedId);
      toast(`${s?.name ?? 'Server'} added.`);
    } catch (e: any) {
      setErr(e?.message ?? String(e));
      setCode('');
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    if (code.length === 6) submit();
  }, [code]);
  return (
    <Sheet title="Add a Server" message="Enter the six-letter code shown on the server after you name it." onClose={close} width={440}>
      <View style={{ marginVertical: 10 }}>
        <CodeInput value={code} onChange={(v) => (setErr(null), setCode(v))} onSubmit={submit} autoFocus error={!!err} />
      </View>
      <View style={{ minHeight: 22, alignItems: 'center', justifyContent: 'center' }} accessibilityLiveRegion="polite">
        {err ? (
          <T color="redText" style={{ textAlign: 'center' }}>
            {err}
          </T>
        ) : busy ? (
          <Spinner label="Adding…" />
        ) : (
          <T v="callout" color="secondary" style={{ textAlign: 'center' }}>
            Don’t have a code? Install EasyServer Server on that computer, or run easyserver setup.
          </T>
        )}
      </View>
      <SheetButtons>
        <Button title="Cancel" onPress={close} />
        <Button kind="primary" title="Add Server" onPress={submit} disabled={code.length !== 6} loading={busy} />
      </SheetButtons>
    </Sheet>
  );
}

/**
 * Server: first-run setup. Name the computer, then show a code. There's no way past this
 * screen until a client claims the code.
 */
export function ServerSetup({ state }: { state: SetupState }) {
  const { c } = useTheme();
  const [name, setName] = useState(state.phase === 'name' ? state.suggested : '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const submit = async () => {
    if (!name.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      await backend().setup!(name.trim());
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.window, padding: 32 }}>
      <View {...({ dataSet: { drag: '1' } } as any)} style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 40 }} />
      <View style={{ width: '100%', maxWidth: 440 }}>
        {state.phase === 'name' ? (
          <>
            <T v="largeTitle" accessibilityRole="header" style={{ marginBottom: 6 }}>
              Name This Server
            </T>
            <T color="secondary" style={{ marginBottom: 22 }}>
              Choose a name you’ll recognize in the client app. You can change it later.
            </T>
            <Field label="Server Name" value={name} onChangeText={setName} autoFocus maxLength={64} onSubmitEditing={submit} error={err} placeholder="Living Room Mac" />
            <SheetButtons>
              <Button kind="primary" title="Continue" onPress={submit} disabled={!name.trim()} loading={busy} />
            </SheetButtons>
          </>
        ) : state.phase === 'code' ? (
          <>
            <T v="largeTitle" accessibilityRole="header" style={{ marginBottom: 6, textAlign: 'center' }}>
              Pair a Client
            </T>
            <T color="secondary" style={{ marginBottom: 26, textAlign: 'center' }}>
              On your other device, open EasyServer, choose Add Server, and enter this code.
            </T>
            <CodeDisplay code={state.code} />
            <View style={{ alignItems: 'center', marginTop: 26 }}>
              <Spinner label="Waiting for a client to enter the code…" />
              <T v="callout" color="secondary" style={{ marginTop: 8 }}>
                The code refreshes when it expires.
              </T>
            </View>
          </>
        ) : null}
      </View>
    </View>
  );
}

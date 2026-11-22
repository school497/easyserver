import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Download, ExternalLink, FolderUp, Lock, Play, RotateCw, Square, Trash2, Upload } from 'lucide-react-native';
import { isOnline, isSettingVisible, pluginFolders, settingFolderId, type FileEntry, type FolderSpec, type InstalledPluginRow, type SettingField } from '@easyserver/core';
import { SettingInput } from '../components/SettingFields';
import { Page, Target } from '../components/Page';
import { Button, Card, Empty, IconButton, Mono, Row, SectionHeader, Segmented, Spinner, StatusLabel, T, statusInfo } from '../components/primitives';
import { PluginIcon } from '../components/PluginIcon';
import { Confirm } from '../components/Modal';
import { backend, navigate, run, selectedServer, toast, useApp } from '../state';
import { formatBytes, openUrl, pickFiles, timeAgo } from '../platform';
import { useTheme } from '../theme';
import { iconFor } from './Home';

export function PluginDetailScreen({ pluginId }: { pluginId: string }) {
  const p = useApp((s) => s.plugins.find((x) => x.plugin_id === pluginId));
  const busy = useApp((s) => s.busy[pluginId]);
  const server = useApp(selectedServer);
  const online = backend().mode === 'server' || isOnline(server);
  const back = () => navigate('plugins');

  if (!p) {
    return (
      <Page onBack={back}>
        <Empty title="Plugin Not Installed" body="It may have just been removed." action={<Button title="Back to Plugins" onPress={back} />} />
      </Page>
    );
  }
  const st = statusInfo(p.status);
  const isUp = p.status === 'running' || p.status === 'starting';
  const cmd = (type: 'plugin.start' | 'plugin.stop' | 'plugin.restart', label: string) =>
    run(pluginId, label, () => backend().send(type, { pluginId }, { timeoutMs: 90_000 }));

  return (
    <Page onBack={back} maxWidth={920}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 20, paddingTop: 16, paddingBottom: 24, flexWrap: 'wrap' }}>
        <PluginIcon id={p.plugin_id} name={p.name} uri={iconFor(p)} size={96} />
        <View style={{ flex: 1, minWidth: 220 }}>
          <T v="title1" accessibilityRole="header">
            {p.name}
          </T>
          <T color="secondary" style={{ marginTop: 2, marginBottom: 8 }}>
            {p.manifest.developer} · Version {p.version}
          </T>
          <StatusLabel v="body" status={st.tone} label={busy ? `${busy}…` : st.label} />
          {p.status_detail ? (
            <T v="callout" color={p.status === 'error' ? 'redText' : 'secondary'} selectable style={{ marginTop: 4, maxWidth: 560 }}>
              {p.status_detail}
            </T>
          ) : null}
        </View>
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          {isUp ? (
            <Button icon={Square} title="Stop" onPress={() => cmd('plugin.stop', 'Stopping')} disabled={!online || !!busy} />
          ) : (
            <Button icon={Play} kind="primary" title="Start" onPress={() => cmd('plugin.start', 'Starting')} disabled={!online || !!busy || p.status === 'installing'} />
          )}
          <Button icon={RotateCw} title="Restart" onPress={() => cmd('plugin.restart', 'Restarting')} disabled={!online || !!busy || !isUp} />
        </View>
      </View>

      {!online && (
        <Card style={{ marginBottom: 20 }}>
          <T color="secondary">{server?.name ?? 'The server'} is offline. Controls come back when it reconnects.</T>
        </Card>
      )}

      {p.links?.length ? (
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 28, flexWrap: 'wrap' }}>
          {p.links.map((l) => (
            <View key={l.url} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Button kind="secondary" icon={ExternalLink} title={l.label} onPress={() => openUrl(l.url)} disabled={p.status !== 'running'} />
              <T v="callout" color="secondary" selectable>
                {l.url.replace(/^https?:\/\//, '').replace(/\/$/, '')}
              </T>
            </View>
          ))}
        </View>
      ) : null}

      {p.manifest.settings?.length ? <SettingsSection p={p} online={online} /> : null}
      {pluginFolders(p.manifest).map((f, i) => (
        <FolderSection key={f.id} p={p} online={online} spec={f} first={i === 0} />
      ))}
      {p.manifest.actions?.length ? <ActionsSection p={p} online={online} /> : null}
      <LogsSection p={p} online={online} />
      <RemoveSection p={p} online={online} />
    </Page>
  );
}

/* ───────────── Settings, generated from the manifest ───────────── */

function SettingsSection({ p, online }: { p: InstalledPluginRow; online: boolean }) {
  const [draft, setDraft] = useState<Record<string, any>>(p.settings);
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);
  const busy = useApp((s) => s.busy[`${p.plugin_id}:settings`]);
  useEffect(() => {
    setDraft(p.settings);
  }, [p.settings]);
  const fields = p.manifest.settings!;
  const same = (a: any, b: any) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
  const dirty = fields.some((f) => !same(draft[f.key], p.settings[f.key]));
  const willRestart = p.status === 'running' && fields.some((f) => f.restart !== false && !same(draft[f.key], p.settings[f.key]));

  const save = async () => {
    const res = await run(`${p.plugin_id}:settings`, 'Saving', () => backend().send('plugin.settings', { pluginId: p.plugin_id, settings: draft }, { timeoutMs: 90_000 }));
    if (res) toast('Settings saved.');
  };

  const pickFor = (f: SettingField) => async () => {
    const [file] = await pickFiles({ accept: f.accept });
    if (!file) return null;
    const name = file.path.split('/').pop()!;
    if (file.data.length > (f.maxFileMB ?? 10) * 1024 * 1024) return toast(`${name} is larger than ${f.maxFileMB ?? 10} MB.`, 'error'), null;
    setUploadingKey(f.key);
    try {
      await backend().upload(p.plugin_id, [{ path: name, data: file.data }], undefined, settingFolderId(f.key));
      return name;
    } catch (e: any) {
      toast(e?.message ?? String(e), 'error');
      return null;
    } finally {
      setUploadingKey(null);
    }
  };

  let lastGroup: string | undefined;
  return (
    <Target id={`plugin.${p.plugin_id}.settings`} style={{ marginBottom: 32 }}>
      <SectionHeader title="Settings" />
      <Card>
        {fields.map((f) => {
          if (!isSettingVisible(f, draft)) return null;
          const header = f.group && f.group !== lastGroup ? f.group : null;
          if (f.group) lastGroup = f.group;
          return (
            <View key={f.key}>
              {header ? (
                <T v="caption" color="secondary" style={{ textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: '600', marginTop: 6, marginBottom: 10 }}>
                  {header}
                </T>
              ) : null}
              <Target id={`plugin.${p.plugin_id}.setting.${f.key}`} radius={8}>
                <SettingInput
                  field={f}
                  value={draft[f.key]}
                  onChange={(v) => setDraft((d) => ({ ...d, [f.key]: v }))}
                  onPickFile={online ? pickFor(f) : undefined}
                  uploading={uploadingKey === f.key}
                />
              </Target>
            </View>
          );
        })}
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
          {willRestart ? (
            <T v="callout" color="secondary">
              Saving restarts {p.name}.
            </T>
          ) : null}
          <Button title="Revert" onPress={() => setDraft(p.settings)} disabled={!dirty || !!busy} />
          <Button kind="primary" title="Save Changes" onPress={save} disabled={!dirty || !online} loading={!!busy} />
        </View>
      </Card>
    </Target>
  );
}

/* ───────────── File transfer: every plugin has at least one folder ───────────── */

function saveToDisk(name: string, data: Uint8Array) {
  if (typeof document === 'undefined') return;
  const url = URL.createObjectURL(new Blob([data as any]));
  const a = document.createElement('a');
  a.href = url;
  a.download = name.split('/').pop() || 'download';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

function FolderSection({ p, online, spec, first }: { p: InstalledPluginRow; online: boolean; spec: FolderSpec; first: boolean }) {
  const { c } = useTheme();
  const [files, setFiles] = useState<FileEntry[] | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);
  const mode = backend().mode;
  const serverName = useApp(selectedServer)?.name ?? 'the server';
  const key = `${p.plugin_id}:files:${spec.id}`;

  const load = useCallback(async () => {
    if (!online) return;
    const res = await run(key, 'Loading', () => backend().send('plugin.files.list', { pluginId: p.plugin_id, folder: spec.id }));
    if (res) setFiles(res.files);
  }, [p.plugin_id, spec.id, online]);
  useEffect(() => {
    load();
  }, [load]);

  const upload = async (directory: boolean) => {
    const picked = await pickFiles({ directory, accept: spec.accept });
    if (!picked.length) return;
    const ok = (f: { path: string }) => !spec.accept?.length || spec.accept.map((x) => x.toLowerCase()).includes(f.path.slice(f.path.lastIndexOf('.')).toLowerCase());
    const allowed = picked.filter(ok);
    const skipped = picked.length - allowed.length;
    const tooBig = allowed.find((f) => f.data.length > (spec.maxFileMB ?? 50) * 1024 * 1024);
    if (tooBig) return toast(`${tooBig.path} is larger than ${spec.maxFileMB ?? 50} MB.`, 'error');
    if (!allowed.length) return toast('None of those file types can be uploaded here.', 'error');
    setProgress(`Encrypting and uploading 0 of ${allowed.length}…`);
    try {
      await backend().upload(p.plugin_id, allowed, (d, t) => setProgress(`Encrypting and uploading ${Math.floor(d)} of ${t}…`), spec.id);
      toast(`Uploaded ${allowed.length} file${allowed.length === 1 ? '' : 's'}${skipped ? `, skipped ${skipped} unsupported` : ''}.`);
      await load();
    } catch (e: any) {
      toast(e?.message ?? String(e), 'error');
    } finally {
      setProgress(null);
    }
  };

  const download = async (path: string) => {
    setDownloading(path);
    try {
      saveToDisk(path, await backend().download(p.plugin_id, path, spec.id));
    } catch (e: any) {
      toast(e?.message ?? String(e), 'error');
    } finally {
      setDownloading(null);
    }
  };

  const remove = async (path: string) => {
    setToDelete(null);
    const res = await run(key, 'Deleting', () => backend().send('plugin.files.delete', { pluginId: p.plugin_id, path, folder: spec.id }));
    if (res) setFiles((f) => f?.filter((x) => x.path !== path) ?? null);
  };

  const total = files?.reduce((n, f) => n + f.size, 0) ?? 0;
  const canDownload = spec.download !== false;

  return (
    <Target id={`plugin.${p.plugin_id}.files${first ? '' : '.' + spec.id}`} style={{ marginBottom: 32 }}>
      <SectionHeader
        title={spec.label}
        right={
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button icon={Upload} title="Upload Files…" onPress={() => upload(false)} disabled={!online || !!progress} />
            <Button icon={FolderUp} title="Upload Folder…" onPress={() => upload(true)} disabled={!online || !!progress} />
          </View>
        }
      />
      {spec.description ? (
        <T v="callout" color="secondary" style={{ marginTop: -6, marginBottom: 6 }}>
          {spec.description.replace(/\{\{\w+\}\}/g, 'the plugin folder')}
        </T>
      ) : null}
      {mode === 'client' ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 }}>
          <Lock size={12} color={c.secondary} />
          <T v="callout" color="secondary">
            Encrypted end to end between this computer and {serverName}.
          </T>
        </View>
      ) : null}
      <Card padded={false}>
        {progress ? (
          <View style={{ padding: 14, borderBottomWidth: 1, borderBottomColor: c.separator }}>
            <Spinner label={progress} />
          </View>
        ) : null}
        {files == null ? (
          <View style={{ padding: 14 }}>{online ? <Spinner label="Loading files…" /> : <T color="secondary">Files are available when the server is online.</T>}</View>
        ) : files.length === 0 ? (
          <View style={{ padding: 14 }}>
            <T color="secondary">No files.{spec.accept?.length ? ` Accepts ${spec.accept.join(', ')}.` : ''}</T>
          </View>
        ) : (
          files.map((f, i) => (
            <View key={f.path} style={[{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, minHeight: 36, gap: 10 }, i > 0 && { borderTopWidth: 1, borderTopColor: c.separator }]}>
              <T numberOfLines={1} selectable style={{ flex: 1 }}>
                {f.path}
              </T>
              <T v="callout" color="secondary" style={{ width: 72, textAlign: 'right', fontVariant: ['tabular-nums'] }}>
                {formatBytes(f.size)}
              </T>
              <T v="callout" color="secondary" style={{ width: 96, textAlign: 'right' }}>
                {timeAgo(f.modified)}
              </T>
              {canDownload ? (
                downloading === f.path ? (
                  <View style={{ width: 26, alignItems: 'center' }}>
                    <Spinner />
                  </View>
                ) : (
                  <IconButton icon={Download} label={`Download ${f.path}`} onPress={() => download(f.path)} size={26} />
                )
              ) : null}
              <IconButton icon={Trash2} label={`Delete ${f.path}`} onPress={() => setToDelete(f.path)} size={26} />
            </View>
          ))
        )}
      </Card>
      {files?.length ? (
        <T v="caption" color="secondary" style={{ marginTop: 6 }}>
          {files.length} files · {formatBytes(total)}
        </T>
      ) : null}
      {toDelete ? (
        <Confirm title={`Delete “${toDelete}”?`} message="The file is removed from the server right away. This can't be undone." confirmLabel="Delete" onCancel={() => setToDelete(null)} onConfirm={() => remove(toDelete)} />
      ) : null}
    </Target>
  );
}

/* ───────────── Actions ───────────── */

function ActionsSection({ p, online }: { p: InstalledPluginRow; online: boolean }) {
  const [output, setOutput] = useState<{ label: string; code: number; text: string } | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const busy = useApp((s) => s.busy[`${p.plugin_id}:action`]);
  const platform = useApp(selectedServer)?.platform;
  // Only the actions that work on this server's operating system.
  const actions = (p.manifest.actions ?? []).filter((a) => !a.platforms || !platform || a.platforms.includes(platform as any));
  const exec = async (id: string) => {
    setConfirm(null);
    const a = actions.find((x) => x.id === id)!;
    const timeoutMs = a.background ? 60_000 : (Math.min(a.timeoutSec ?? 120, 600) + 30) * 1000;
    const res = await run(`${p.plugin_id}:action`, a.label, () => backend().send('plugin.action', { pluginId: p.plugin_id, actionId: id }, { timeoutMs }));
    if (res) setOutput({ label: a.label, code: res.code, text: res.output });
  };
  const pending = actions.find((a) => a.id === confirm);
  if (!actions.length) return null;
  return (
    <Target id={`plugin.${p.plugin_id}.actions`} style={{ marginBottom: 32 }}>
      <SectionHeader title="Actions" />
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: output ? 12 : 0 }}>
        {actions.map((a) => (
          <Button
            key={a.id}
            title={a.label}
            kind={a.destructive ? 'destructive' : 'secondary'}
            loading={busy === a.label}
            disabled={!online || !!busy}
            onPress={() => (a.confirm ? setConfirm(a.id) : exec(a.id))}
          />
        ))}
      </View>
      {output ? (
        <View>
          <T v="callout" color={output.code === 0 ? 'secondary' : 'redText'} style={{ marginBottom: 6 }}>
            {output.label} · {output.code === 0 ? 'finished' : `exited with code ${output.code}`}
          </T>
          <Mono lines={output.text.split('\n')} />
        </View>
      ) : null}
      {pending ? <Confirm title={pending.label} message={pending.confirm!} confirmLabel={pending.label} destructive={!!pending.destructive} onCancel={() => setConfirm(null)} onConfirm={() => exec(pending.id)} /> : null}
    </Target>
  );
}

/* ───────────── Logs ───────────── */

function LogsSection({ p, online }: { p: InstalledPluginRow; online: boolean }) {
  const options = useMemo(
    () => [...(p.manifest.logs ?? []).map((l) => ({ label: l.label, value: l.id })), { label: 'Output', value: 'process' }, ...(p.manifest.actions?.length ? [{ label: 'Actions', value: 'actions' }] : []), { label: 'Install', value: 'install' }],
    [p.manifest.logs],
  );
  const [logId, setLogId] = useState(options[0].value);
  const [lines, setLines] = useState<string[] | null>(null);
  const busy = useApp((s) => s.busy[`${p.plugin_id}:logs`]);
  const load = useCallback(async () => {
    if (!online) return;
    const res = await run(`${p.plugin_id}:logs`, 'Loading', () => backend().send('plugin.logs', { pluginId: p.plugin_id, logId, lines: 300 }));
    if (res) setLines(res.lines);
  }, [p.plugin_id, logId, online]);
  useEffect(() => {
    load();
  }, [load]);
  return (
    <Target id={`plugin.${p.plugin_id}.logs`} style={{ marginBottom: 32 }}>
      <SectionHeader title="Logs" right={<Button icon={RotateCw} title="Refresh" onPress={load} loading={!!busy} disabled={!online} />} />
      <View style={{ marginBottom: 10 }}>
        <Segmented label="Log" value={logId} options={options} onChange={setLogId} />
      </View>
      {lines == null ? <Spinner label="Loading…" /> : <Mono lines={lines} empty="This log is empty." />}
    </Target>
  );
}

/* ───────────── Remove ───────────── */

function RemoveSection({ p, online }: { p: InstalledPluginRow; online: boolean }) {
  const [ask, setAsk] = useState(false);
  const busy = useApp((s) => s.busy[p.plugin_id]);
  const remove = async () => {
    setAsk(false);
    const ok = await run(p.plugin_id, 'Removing', () => backend().send('plugin.uninstall', { pluginId: p.plugin_id }, { timeoutMs: 90_000 }));
    if (ok !== undefined) {
      toast(`${p.name} was removed.`);
      navigate('plugins');
    }
  };
  return (
    <Target id={`plugin.${p.plugin_id}.remove`}>
      <Card>
        <Row label={`Installed ${timeAgo(p.installed_at)}`} last>
          <Button kind="destructive" title="Remove Plugin…" onPress={() => setAsk(true)} disabled={!online || !!busy} />
        </Row>
      </Card>
      {ask ? (
        <Confirm
          title={`Remove ${p.name}?`}
          message={`${p.name} stops and its files, settings and logs are deleted from the server, including ${pluginFolders(p.manifest).map((f) => f.label.toLowerCase()).join(' and ')}. This can't be undone.`}
          confirmLabel="Remove"
          onCancel={() => setAsk(false)}
          onConfirm={remove}
        />
      ) : null}
    </Target>
  );
}

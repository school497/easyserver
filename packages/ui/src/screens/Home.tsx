import React, { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { isOnline, parseGithubUrl, rawUrl } from '@easyserver/core';
import { Page, Target } from '../components/Page';
import { Button, Card, Empty, Row, SectionHeader, StatusLabel, T, statusInfo } from '../components/primitives';
import { PluginIcon } from '../components/PluginIcon';
import { backend, navigate, selectedServer, store, useApp } from '../state';
import { formatBytes, formatDuration, platformName, timeAgo } from '../platform';
import { useTheme } from '../theme';
import { findCatalogItem } from '../catalog';

function useNow(ms = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

function Meter({ value, label, higherIsBetter }: { value: number | null; label: string; higherIsBetter?: boolean }) {
  const { c } = useTheme();
  const v = Math.max(0, Math.min(1, value ?? 0));
  const color = higherIsBetter ? (v < 0.9 ? c.red : v < 0.98 ? c.orange : c.green) : v > 0.9 ? c.red : v > 0.75 ? c.orange : c.accent;
  return (
    <View accessible accessibilityRole={'progressbar' as any} accessibilityLabel={label} accessibilityValue={{ min: 0, max: 100, now: Math.round(v * 100) }} style={{ height: 6, borderRadius: 3, backgroundColor: c.fill, overflow: 'hidden', marginTop: 10 }}>
      <View style={{ width: `${v * 100}%`, height: '100%', backgroundColor: color, borderRadius: 3 }} />
    </View>
  );
}

function Tile({ id, label, value, detail, children }: { id: string; label: string; value: string; detail?: string; children?: React.ReactNode }) {
  return (
    <Target id={id} style={{ flexGrow: 1, flexBasis: 220, minWidth: 200 }}>
      <Card style={{ height: '100%' }}>
        <T v="headline" color="secondary" style={{ marginBottom: 6 }}>
          {label}
        </T>
        <T v="title1" style={{ fontVariant: ['tabular-nums'] }}>
          {value}
        </T>
        {detail ? (
          <T v="callout" color="secondary" style={{ marginTop: 2 }}>
            {detail}
          </T>
        ) : null}
        {children}
      </Card>
    </Target>
  );
}

const pct = (r: number | null | undefined) => (r == null ? '—' : `${(r * 100).toFixed(r >= 0.9995 ? 0 : 1)}%`);

export function HomeScreen() {
  const { c } = useTheme();
  const server = useApp(selectedServer);
  const status = useApp((s) => s.status);
  const uptime = useApp((s) => s.uptime);
  const plugins = useApp((s) => s.plugins);
  const mode = backend().mode;
  const now = useNow();

  if (!server) {
    return (
      <Page title="Home">
        <Empty
          title="Add Your First Server"
          body="Install EasyServer Server on the computer you want to control. It shows a six-letter code to enter here."
          action={<Button kind="primary" title="Add Server…" onPress={() => store.set({ addServerOpen: true })} />}
        />
      </Page>
    );
  }

  const online = mode === 'server' || isOnline(server);
  const runSec = server.started_at && online ? (now - Date.parse(server.started_at)) / 1000 : 0;
  const up = (h: number) => uptime.find((u) => u.window_hours === h)?.ratio ?? null;
  const running = plugins.filter((p) => p.status === 'running');
  const memRatio = status?.mem_total ? (status.mem_used ?? 0) / status.mem_total : null;
  const diskRatio = status?.disk_total ? (status.disk_used ?? 0) / status.disk_total : null;

  return (
    <Page
      title={server.name}
      subtitle={
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <StatusLabel v="body" status={online ? 'green' : 'red'} label={online ? 'Online' : `Offline · last seen ${timeAgo(server.last_seen_at)}`} />
          <T color="secondary">
            {status?.os_name ?? platformName(server.platform)} · {server.hostname ?? ''}
          </T>
        </View>
      }
    >
      {!online && (
        <Card style={{ marginBottom: 16, backgroundColor: c.fill, borderWidth: 0 }}>
          <T v="headline">This server is offline.</T>
          <T color="secondary" style={{ marginTop: 2 }}>
            Turn on the computer, then open EasyServer Server or run easyserver start.
          </T>
        </Card>
      )}

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginBottom: 28 }}>
        <Tile
          id="home.runtime"
          label="Run Time"
          value={online ? formatDuration(runSec) : '—'}
          detail={server.started_at && online ? `Since ${new Date(server.started_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}` : 'Not running'}
        />
        <Tile id="home.uprate" label="Up Rate" value={pct(up(24))} detail={`Last 24 hours. ${pct(up(168))} this week, ${pct(up(720))} this month.`}>
          <Meter value={up(24)} label="Up rate, last 24 hours" higherIsBetter />
        </Tile>
        <Tile
          id="home.plugins"
          label="Plugins"
          value={`${running.length} of ${plugins.length}`}
          detail={plugins.length ? 'running' : 'None installed yet'}
        />
      </View>

      <Target id="home.resources">
        <SectionHeader title="Resources" ruled />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginBottom: 28 }}>
          <Tile id="home.cpu" label="Processor" value={status?.cpu != null ? `${Math.round(status.cpu * 100)}%` : '—'} detail={status?.load_avg ? `Load ${status.load_avg.toFixed(2)}` : 'Across all cores'}>
            <Meter value={status?.cpu ?? null} label="Processor usage" />
          </Tile>
          <Tile id="home.memory" label="Memory" value={formatBytes(status?.mem_used)} detail={`of ${formatBytes(status?.mem_total)}`}>
            <Meter value={memRatio} label="Memory usage" />
          </Tile>
          <Tile id="home.disk" label="Disk" value={formatBytes(status?.disk_used)} detail={`of ${formatBytes(status?.disk_total)}`}>
            <Meter value={diskRatio} label="Disk usage" />
          </Tile>
        </View>
      </Target>

      <Target id="home.running">
        <SectionHeader ruled title="Running Plugins" right={plugins.length ? <Button kind="plain" title="See All" onPress={() => navigate('plugins')} /> : null} />
        <Card padded={false} style={{ marginBottom: 28 }}>
          {running.length === 0 ? (
            <View style={{ padding: 16 }}>
              <T color="secondary">{plugins.length ? 'No plugins are running.' : 'No plugins installed.'}</T>
            </View>
          ) : (
            running.map((p, i) => (
              <Pressable
                key={p.plugin_id}
                accessibilityRole="link"
                accessibilityLabel={`${p.name}, running`}
                onPress={() => navigate('plugins', { kind: 'plugin', pluginId: p.plugin_id })}
                style={(st: any) => [
                  { flexDirection: 'row', alignItems: 'center', padding: 12, paddingHorizontal: 16, gap: 12 },
                  i > 0 && { borderTopWidth: 1, borderTopColor: c.separator },
                  st.hovered && { backgroundColor: c.fill },
                ]}
              >
                <PluginIcon id={p.plugin_id} name={p.name} uri={iconFor(p)} size={32} />
                <View style={{ flex: 1 }}>
                  <T v="headline">{p.name}</T>
                  <StatusLabel status={statusInfo(p.status).tone} label={p.status_detail ?? statusInfo(p.status).label} />
                </View>
                {p.links?.[0] ? <T color="accentText">{p.links[0].url.replace(/^https?:\/\//, '')}</T> : null}
              </Pressable>
            ))
          )}
        </Card>
      </Target>

      <Target id="home.system">
        <SectionHeader title="System" ruled />
        <Card style={{ paddingVertical: 4 }}>
          <Row label="Operating System" value={status?.os_name ?? platformName(server.platform)} />
          <Row label="Architecture" value={server.arch === 'arm64' ? 'Apple silicon / ARM64' : server.arch ?? '—'} />
          <Row label="Computer Name" value={server.hostname ?? '—'} />
          <Row label="Computer Up Time" value={status?.os_uptime ? formatDuration(status.os_uptime) : '—'} />
          <Row label="EasyServer Version" value={server.agent_version ?? '—'} />
          <Row label="Last Check-In" value={timeAgo(status?.updated_at ?? server.last_seen_at)} last />
        </Card>
      </Target>
    </Page>
  );
}

/** Installed plugins keep their source URL; the store cache knows the icon. */
export function iconFor(p: { source_url: string | null; manifest?: { icon?: string } }) {
  if (!p.source_url) return null;
  const cached = findCatalogItem(p.source_url)?.iconUrl;
  if (cached) return cached;
  try {
    return p.manifest?.icon ? rawUrl(parseGithubUrl(p.source_url), p.manifest.icon) : null;
  } catch {
    return null;
  }
}

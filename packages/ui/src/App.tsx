import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { isConfigured } from '@easyserver/core';
import { Sidebar, TABS } from './components/Sidebar';
import { revealTarget, setReducedMotion } from './components/Page';
import { Button, Spinner, T } from './components/primitives';
import { HomeScreen } from './screens/Home';
import { DiscoverScreen } from './screens/Discover';
import { StoreDetailScreen } from './screens/StoreDetail';
import { PluginsScreen } from './screens/Plugins';
import { PluginDetailScreen } from './screens/PluginDetail';
import { SearchScreen } from './screens/Search';
import { SettingsScreen } from './screens/Settings';
import { AddServerSheet, ServerSetup } from './screens/Pairing';
import { ClientBackend } from './backend/client';
import { ServerBackend } from './backend/server';
import { DemoBackend } from './backend/demo';
import type { Backend, SetupState } from './backend/types';
import { navigate, setBackend, store, useApp } from './state';
import { refreshCatalog } from './catalog';
import { useReducedMotion } from './platform';
import { useTheme } from './theme';

export interface AppProps {
  mode: 'client' | 'server';
}

function pickBackend(mode: 'client' | 'server'): Backend {
  const demo = typeof location !== 'undefined' && new URLSearchParams(location.search).has('demo');
  if (demo || (mode === 'client' && !isConfigured()) || (mode === 'server' && !(globalThis as any).easyserver)) return new DemoBackend(mode);
  return mode === 'client' ? new ClientBackend() : new ServerBackend();
}

const shell = () => (globalThis as any).easyserverShell as undefined | { platform: string; on(e: string, cb: (...a: any[]) => void): () => void; send(e: string, ...a: any[]): void };

export function App({ mode }: AppProps) {
  const { c } = useTheme();
  const [b] = useState(() => {
    const be = pickBackend(mode);
    setBackend(be);
    return be;
  });
  const booted = useApp((s) => s.booted);
  const bootError = useApp((s) => s.bootError);
  const addOpen = useApp((s) => s.addServerOpen);
  const [setup, setSetup] = useState<SetupState | null>(mode === 'server' ? null : { phase: 'done' });
  const reduced = useReducedMotion();
  useEffect(() => {
    setReducedMotion(reduced);
  }, [reduced]);

  const boot = async () => {
    store.set({ bootError: null });
    try {
      if (b.setupState) {
        b.onSetupChanged?.(setSetup);
        setSetup(await b.setupState());
      }
      await b.init((patch) => store.set(patch));
      store.set({ booted: true });
      refreshCatalog(true);
    } catch (e: any) {
      store.set({ bootError: e?.message ?? String(e) });
    }
  };
  useEffect(() => {
    boot();
  }, []);

  // Keyboard shortcuts (mirrored in the native menu bar): ⌘1–5 sections, ⌘F search, ⌘, settings, ⌘N add server.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey) return;
      const t = TABS.find((x) => x.key === e.key);
      if (t) return e.preventDefault(), navigate(t.tab);
      if (e.key === 'f') return e.preventDefault(), navigate('search');
      if (e.key === ',') return e.preventDefault(), navigate('settings');
      if (e.key === 'n' && mode === 'client') return e.preventDefault(), store.set({ addServerOpen: true });
    };
    window.addEventListener('keydown', onKey);
    const off = shell()?.on('menu', (cmd: string) => {
      if (cmd === 'addServer') store.set({ addServerOpen: true });
      else if (cmd.startsWith('select:')) b.select(cmd.slice(7));
      else navigate(cmd as any);
    });
    return () => {
      window.removeEventListener('keydown', onKey);
      off?.();
    };
  }, []);

  // Keep the native Server menu in sync with the list.
  const servers = useApp((s) => s.servers);
  const selectedId = useApp((s) => s.selectedId);
  useEffect(() => {
    const r = store.get().route;
    if (r.detail?.kind === 'plugin') navigate('plugins');
  }, [selectedId]);
  useEffect(() => {
    shell()?.send('servers', servers.map((s) => ({ id: s.id, name: s.name, selected: s.id === selectedId })));
  }, [servers, selectedId]);

  if (bootError) {
    return (
      <Centered>
        <T v="title2" style={{ marginBottom: 6 }}>
          Can’t Connect
        </T>
        <T color="secondary" style={{ textAlign: 'center', maxWidth: 420, marginBottom: 16 }} selectable>
          {bootError}
        </T>
        <Button kind="primary" title="Try Again" onPress={boot} />
      </Centered>
    );
  }
  if (setup && setup.phase !== 'done') return <ServerSetup state={setup} />;
  if (!booted || !setup) {
    return (
      <Centered>
        <Spinner label="Connecting…" />
      </Centered>
    );
  }

  const mac = shell()?.platform === 'darwin';
  return (
    <View style={{ flex: 1, flexDirection: 'row', backgroundColor: mac ? 'transparent' : c.window }}>
      <View style={{ flex: 1, flexDirection: 'row' }} {...({ dataSet: addOpen ? { blurred: '1' } : {} } as any)}>
        <Sidebar topInset={mac ? 52 : 14} translucent={mac} />
        <Content />
      </View>
      {addOpen ? <AddServerSheet /> : null}
      <Toast />
      {b.demo ? <DemoBadge /> : null}
    </View>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  const { c } = useTheme();
  return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.window, padding: 24 }}>{children}</View>;
}

/** Page transitions: a short fade and lift when you change section or open a detail page. */
function Content() {
  const { c } = useTheme();
  const route = useApp((s) => s.route);
  const reduced = useReducedMotion();
  const anim = useRef(new Animated.Value(1)).current;
  const key = `${route.tab}:${route.detail ? JSON.stringify(route.detail) : ''}`;
  const last = useRef(key);
  useEffect(() => {
    if (last.current !== key && !reduced) {
      anim.setValue(0);
      Animated.timing(anim, { toValue: 1, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
    }
    last.current = key;
    if (route.target) revealTarget(route.target);
  }, [route.nonce]);

  let screen: React.ReactNode;
  if (route.tab === 'discover' && route.detail?.kind === 'store') screen = <StoreDetailScreen sourceUrl={route.detail.sourceUrl} />;
  else if (route.tab === 'plugins' && route.detail?.kind === 'plugin') screen = <PluginDetailScreen pluginId={route.detail.pluginId} />;
  else
    screen = {
      home: <HomeScreen />,
      discover: <DiscoverScreen />,
      plugins: <PluginsScreen />,
      search: <SearchScreen />,
      settings: <SettingsScreen />,
    }[route.tab];

  return (
    <View style={{ flex: 1, backgroundColor: c.window }} accessibilityRole={'main' as any}>
      <View {...({ dataSet: { drag: '1' } } as any)} style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 28, zIndex: 1 }} />
      <Animated.View
        key={key}
        style={{ flex: 1, opacity: anim, transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }] }}
      >
        {screen}
      </Animated.View>
    </View>
  );
}

function Toast() {
  const t = useApp((s) => s.toast);
  const { c, dark } = useTheme();
  if (!t) return null;
  return (
    <View pointerEvents="box-none" style={[StyleSheet.absoluteFill, { justifyContent: 'flex-end', alignItems: 'center', paddingBottom: 24, zIndex: 200 }]}>
      <View
        accessibilityLiveRegion="polite"
        accessibilityRole={'status' as any}
        style={{
          maxWidth: 520,
          paddingHorizontal: 16,
          paddingVertical: 10,
          borderRadius: 12,
          backgroundColor: dark ? '#3A3A3C' : '#1D1D1F',
          boxShadow: `0 8px 24px ${c.shadow}`,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
        } as any}
      >
        {t.tone === 'error' ? <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: c.red }} /> : null}
        <T style={{ color: '#fff' }}>{t.text}</T>
      </View>
    </View>
  );
}

function DemoBadge() {
  const { c } = useTheme();
  return (
    <View pointerEvents="none" style={{ position: 'absolute', top: 10, right: 14, backgroundColor: c.fill, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3, zIndex: 50 }}>
      <T v="caption" color="secondary">
        Demo
      </T>
    </View>
  );
}

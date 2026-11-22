import { showFocusRing, useReducedMotion } from '../platform';
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Check, ChevronsUpDown, Compass, House, LayoutGrid, Plus, Search, Settings } from 'lucide-react-native';
import { isOnline } from '@easyserver/core';
import { navigate, selectedServer, store, useApp, backend, type Tab } from '../state';
import { useTheme, type } from '../theme';
import { T } from './primitives';

export const TABS: { tab: Tab; label: string; icon: any; key: string }[] = [
  { tab: 'home', label: 'Home', icon: House, key: '1' },
  { tab: 'discover', label: 'Discover', icon: Compass, key: '2' },
  { tab: 'plugins', label: 'Plugins', icon: LayoutGrid, key: '3' },
  { tab: 'search', label: 'Search', icon: Search, key: '4' },
  { tab: 'settings', label: 'Settings', icon: Settings, key: '5' },
];

export function Sidebar({ topInset, translucent }: { topInset: number; translucent: boolean }) {
  const { c } = useTheme();
  const route = useApp((s) => s.route);
  const mode = backend().mode;
  const reduced = useReducedMotion();
  // The selection highlight slides between rows instead of jumping.
  const rows = useRef<Record<string, number>>({});
  const hy = useRef(new Animated.Value(0)).current;
  const [measured, setMeasured] = useState(0);
  const placed = useRef(false);
  useEffect(() => {
    const y = rows.current[route.tab];
    if (y == null) return;
    if (!placed.current || reduced) {
      hy.setValue(y);
      placed.current = true;
    } else Animated.spring(hy, { toValue: y, stiffness: 320, damping: 30, mass: 0.9, useNativeDriver: false }).start();
  }, [route.tab, measured]);
  return (
    <View
      accessibilityRole={'navigation' as any}
      style={{
        width: 220,
        backgroundColor: translucent ? 'transparent' : c.sidebar,
        borderRightWidth: StyleSheet.hairlineWidth,
        borderRightColor: c.separator,
      }}
    >
      <View {...({ dataSet: { drag: '1' } } as any)} style={{ height: topInset }} />
      <View {...({ dataSet: { drag: '1' } } as any)} accessibilityRole="header" style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 14 }}>
        <AppLogo size={28} server={mode === 'server'} />
        <T style={{ marginLeft: 10, fontSize: 18, fontWeight: '700', letterSpacing: -0.35, fontFamily: type.title2.fontFamily }} numberOfLines={1}>
          EasyServer
        </T>
        {mode === 'server' ? (
          <T v="caption" color="secondary" style={{ marginLeft: 6, marginTop: 3, fontWeight: '600' }}>
            Server
          </T>
        ) : null}
      </View>
      <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: c.sidebarRule, marginHorizontal: 10 }} />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 10, paddingTop: 12 }}>
        <Animated.View
          pointerEvents="none"
          style={{ position: 'absolute', left: 10, right: 10, height: 36, top: hy, borderRadius: 7, backgroundColor: c.sidebarSelected, opacity: measured ? 1 : 0 }}
        />
        {TABS.map((t, i) => {
          const on = route.tab === t.tab;
          const nextOn = TABS[i + 1]?.tab === route.tab;
          const Icon = t.icon;
          return (
            <React.Fragment key={t.tab}>
            <Pressable
              accessibilityRole="link"
              accessibilityState={{ selected: on }}
              accessibilityLabel={t.label}
              onPress={() => navigate(t.tab)}
              onLayout={(e) => {
                rows.current[t.tab] = e.nativeEvent.layout.y;
                if (Object.keys(rows.current).length === TABS.length) setMeasured((n) => n + 1);
              }}
              style={(st: any) => [
                styles.item,
                !on && st.hovered && { backgroundColor: c.sidebarSelected, opacity: 0.6 },
                showFocusRing(st.focused) && ({ outlineColor: c.accent, outlineWidth: 2, outlineStyle: 'solid' } as any),
              ]}
            >
              <Icon size={17} color={c.accent} strokeWidth={on ? 2.3 : 1.9} />
              <T v="sidebar" style={[{ marginLeft: 10 }, on && { fontWeight: '600' }]}>
                {t.label}
              </T>
            </Pressable>
            {/* Hairline rules between rows, like the sketch; hidden next to the selected row. */}
            {i < TABS.length - 1 ? (
              <View style={{ height: StyleSheet.hairlineWidth, marginHorizontal: 10, backgroundColor: on || nextOn ? 'transparent' : c.sidebarRule }} />
            ) : null}
            </React.Fragment>
          );
        })}
      </ScrollView>
      <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: c.sidebarRule, marginHorizontal: 10 }} />
      {mode === 'client' ? <ServerPicker /> : <ServerBadge />}
    </View>
  );
}

/** The app icon, drawn natively so it stays crisp: blue for the client, graphite for the server app. */
export function AppLogo({ size = 28, server }: { size?: number; server?: boolean }) {
  const [top, bottom, bar, line] = server ? ['#5A5A60', '#1C1C1E', '#F2F2F7', '#8E8E93'] : ['#4AA3FF', '#0060DF', '#FFFFFF', '#9CC8FF'];
  const u = size / 100;
  return (
    <View
      accessible={false}
      style={{ width: size, height: size, borderRadius: size * 0.225, backgroundImage: `linear-gradient(180deg, ${top}, ${bottom})`, backgroundColor: bottom, alignItems: 'center', justifyContent: 'center', gap: 5 * u } as any}
    >
      {[0, 1, 2].map((i) => (
        <View key={i} style={{ width: 54 * u, height: 15 * u, borderRadius: 4.5 * u, backgroundColor: bar, opacity: 1 - i * 0.12, flexDirection: 'row', alignItems: 'center', paddingLeft: 5 * u }}>
          <View style={{ width: 5 * u, height: 5 * u, borderRadius: 3 * u, backgroundColor: '#34C759' }} />
          <View style={{ width: 18 * u, height: 2.6 * u, borderRadius: 2 * u, backgroundColor: line, marginLeft: 5 * u }} />
        </View>
      ))}
    </View>
  );
}

/** Server app: a quiet, non-interactive reminder of which machine this is. */
function ServerBadge() {
  const server = useApp(selectedServer);
  if (!server) return null;
  return (
    <View style={{ padding: 14, flexDirection: 'row', alignItems: 'center' }}>
      <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: '#34C759', marginRight: 8 }} />
      <T v="callout" color="secondary" numberOfLines={1} style={{ flex: 1 }}>
        {server.name}
      </T>
    </View>
  );
}

/** Client app: pill-shaped pop-up button at the foot of the sidebar to switch or add servers. */
function ServerPicker() {
  const { c, dark } = useTheme();
  const servers = useApp((s) => s.servers);
  const current = useApp(selectedServer);
  const [open, setOpen] = useState(false);
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((x) => x + 1), 15_000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (!open || typeof window === 'undefined') return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const dot = (s: any, hl = false) => (
    <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: isOnline(s) ? c.green : c.red, borderWidth: hl ? 1 : 0, borderColor: '#fff' }} />
  );

  return (
    <View style={{ padding: 10, zIndex: 10 }}>
      {open && (
        <>
          <Pressable accessible={false} onPress={() => setOpen(false)} style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, cursor: 'default' } as any} />
          <View
            accessibilityRole={'menu' as any}
            style={{
              position: 'absolute',
              left: 10,
              right: 10,
              bottom: 52,
              backgroundColor: dark ? '#323234' : '#FFFFFF',
              borderRadius: 10,
              paddingVertical: 5,
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: c.cardBorder,
              boxShadow: `0 10px 30px ${c.shadow}`,
            } as any}
          >
            {servers.map((s) => (
              <MenuItem
                key={s.id}
                label={`${s.name}, ${isOnline(s) ? 'online' : 'offline'}`}
                onPress={() => {
                  setOpen(false);
                  backend().select(s.id);
                }}
              >
                {(hl) => (
                  <>
                    <View style={{ width: 16 }}>{s.id === current?.id ? <Check size={13} color={hl ? '#fff' : c.label} strokeWidth={2.6} /> : null}</View>
                    {dot(s, hl)}
                    <T numberOfLines={1} style={[{ marginLeft: 8, flex: 1 }, hl && { color: '#fff' }]}>
                      {s.name}
                    </T>
                  </>
                )}
              </MenuItem>
            ))}
            {servers.length > 0 && <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: c.separator, marginVertical: 5, marginHorizontal: 10 }} />}
            <MenuItem
              label="Add Server…"
              onPress={() => {
                setOpen(false);
                store.set({ addServerOpen: true });
              }}
            >
              {(hl) => (
                <>
                  <Plus size={14} color={hl ? '#fff' : c.label} strokeWidth={2.4} style={{ marginRight: 8 }} />
                  <T style={hl && { color: '#fff' }}>Add Server…</T>
                </>
              )}
            </MenuItem>
          </View>
        </>
      )}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={current ? `Server: ${current.name}. Switch or add a server` : 'Add a server'}
        accessibilityState={{ expanded: open }}
        onPress={() => (servers.length ? setOpen((o) => !o) : store.set({ addServerOpen: true }))}
        style={(st: any) => [
          {
            height: 34,
            borderRadius: 17,
            paddingHorizontal: 12,
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: st.hovered || open ? c.fillStrong : c.fill,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: c.cardBorder,
          },
          showFocusRing(st.focused) && ({ outlineColor: c.accent, outlineWidth: 2, outlineStyle: 'solid' } as any),
        ]}
      >
        {current ? (
          <>
            {dot(current)}
            <T v="headline" numberOfLines={1} style={{ marginLeft: 8, flex: 1 }}>
              {current.name}
            </T>
            <ChevronsUpDown size={14} color={c.secondary} />
          </>
        ) : (
          <>
            <Plus size={15} color={c.accent} strokeWidth={2.4} />
            <T v="headline" style={{ marginLeft: 6 }}>
              Add Server
            </T>
          </>
        )}
      </Pressable>
    </View>
  );
}

function MenuItem({ children, onPress, label }: { children: (hl: boolean) => React.ReactNode; onPress: () => void; label: string }) {
  const { c } = useTheme();
  return (
    <Pressable
      accessibilityRole={'menuitem' as any}
      accessibilityLabel={label}
      onPress={onPress}
      style={(st: any) => [
        { flexDirection: 'row', alignItems: 'center', height: 28, marginHorizontal: 5, paddingHorizontal: 8, borderRadius: 5 },
        (st.hovered || st.focused) && { backgroundColor: c.accent },
      ]}
    >
      {({ hovered, focused }: any) => <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>{children(!!(hovered || focused))}</View>}
    </Pressable>
  );
}

export const sidebarItemStyle = type.body;
const styles = StyleSheet.create({
  item: { flexDirection: 'row', alignItems: 'center', height: 36, paddingHorizontal: 10, borderRadius: 7 },
});

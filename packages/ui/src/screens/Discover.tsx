import { showFocusRing } from '../platform';
import React, { useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { ChevronLeft, ChevronRight, Search as SearchIcon, X } from 'lucide-react-native';
import { CATEGORIES } from '@easyserver/core';
import { Page, Target } from '../components/Page';
import { Button, Empty, IconButton, SectionHeader, Spinner, T } from '../components/primitives';
import { PluginIcon } from '../components/PluginIcon';
import { trending, useLiveCatalog, type CatalogItem } from '../catalog';
import { backend, navigate, run, selectedServer, store, useApp } from '../state';
import { useTheme, type } from '../theme';
import { isOnline } from '@easyserver/core';

/** GET / OPEN / progress, shared by cards and the detail page. */
export function GetButton({ item, large }: { item: CatalogItem; large?: boolean }) {
  const installed = useApp((s) => s.plugins.find((p) => p.plugin_id === item.id));
  const busy = useApp((s) => s.busy[item.sourceUrl]);
  const server = useApp(selectedServer);
  const mode = backend().mode;
  const canInstall = !!server && (mode === 'server' || isOnline(server));
  if (installed) {
    return (
      <Button
        kind="get"
        title="Open"
        accessibilityLabel={`Open ${item.name}`}
        onPress={() => navigate('plugins', { kind: 'plugin', pluginId: item.id })}
        style={large && { minWidth: 88 }}
      />
    );
  }
  return (
    <Button
      kind="get"
      title={busy ? undefined : 'Get'}
      loading={!!busy}
      accessibilityLabel={busy ? `Installing ${item.name}` : `Get ${item.name}`}
      disabled={!canInstall}
      onPress={() => install(item)}
      style={large && { minWidth: 88 }}
    />
  );
}

export async function install(item: CatalogItem) {
  const server = selectedServer(store.get());
  if (!server) return store.set({ addServerOpen: true });
  await run(item.sourceUrl, 'Installing', () => backend().send('plugin.install', { sourceUrl: item.sourceUrl }, { timeoutMs: 10 * 60_000 }));
}

function Card({ item }: { item: CatalogItem }) {
  const { c } = useTheme();
  return (
    <Target id={`store.${item.id}`} style={{ width: 300 }}>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={`${item.name}, ${item.manifest.subtitle ?? CATEGORIES[item.manifest.category]}`}
        onPress={() => navigate('discover', { kind: 'store', sourceUrl: item.sourceUrl })}
        style={(st: any) => [
          { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 10, marginHorizontal: -10, borderRadius: 12, gap: 12 },
          st.hovered && { backgroundColor: c.fill },
          showFocusRing(st.focused) && ({ outlineColor: c.accent, outlineWidth: 2, outlineStyle: 'solid' } as any),
        ]}
      >
        <PluginIcon uri={item.iconUrl} name={item.name} id={item.id} size={64} />
        <View style={{ flex: 1, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.separator, paddingBottom: 10, alignSelf: 'stretch', justifyContent: 'center' }}>
          <T v="headline" numberOfLines={1}>
            {item.name}
          </T>
          <T v="callout" color="secondary" numberOfLines={2} style={{ marginBottom: 6 }}>
            {item.manifest.subtitle ?? CATEGORIES[item.manifest.category]}
          </T>
          <View style={{ alignSelf: 'flex-start' }}>
            <GetButton item={item} />
          </View>
        </View>
      </Pressable>
    </Target>
  );
}

/** Horizontally scrolling shelf with arrow buttons for people without a trackpad. */
function Shelf({ id, title, items, ruled }: { id: string; title: string; items: CatalogItem[]; ruled?: boolean }) {
  const ref = useRef<ScrollView>(null);
  const x = useRef(0);
  if (!items.length) return null;
  const page = (dir: number) => ref.current?.scrollTo({ x: Math.max(0, x.current + dir * 620), animated: true });
  return (
    <Target id={id} style={{ marginBottom: 30 }}>
      <SectionHeader
        ruled={ruled}
        title={title}
        right={
          items.length > 3 ? (
            <View style={{ flexDirection: 'row' }}>
              <IconButton icon={ChevronLeft} label={`Scroll ${title} back`} onPress={() => page(-1)} />
              <IconButton icon={ChevronRight} label={`Scroll ${title} forward`} onPress={() => page(1)} />
            </View>
          ) : null
        }
      />
      <ScrollView
        ref={ref}
        horizontal
        showsHorizontalScrollIndicator={false}
        onScroll={(e) => (x.current = e.nativeEvent.contentOffset.x)}
        scrollEventThrottle={32}
        style={{ marginHorizontal: -32 }}
        contentContainerStyle={{ paddingHorizontal: 32, gap: 28 }}
      >
        {items.map((it) => (
          <Card key={it.sourceUrl} item={it} />
        ))}
      </ScrollView>
    </Target>
  );
}

export function DiscoverScreen() {
  const { c } = useTheme();
  const cat = useLiveCatalog();
  const [q, setQ] = useState('');
  const server = useApp(selectedServer);
  const mode = backend().mode;
  const query = q.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      cat.items.filter(
        (i) =>
          !query ||
          i.name.toLowerCase().includes(query) ||
          i.manifest.developer.toLowerCase().includes(query) ||
          (i.manifest.subtitle ?? '').toLowerCase().includes(query) ||
          CATEGORIES[i.manifest.category].toLowerCase().includes(query),
      ),
    [cat.items, query],
  );
  const top = useMemo(() => trending(cat.items, cat.stats), [cat.items, cat.stats]);
  const az = useMemo(() => [...cat.items].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })), [cat.items]);

  return (
    <Page title="Discover" subtitle={server && mode === 'client' ? `Installs to ${server.name}` : undefined}>
      <Target id="discover.search" style={{ marginBottom: 26 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: c.fill, borderRadius: 8, height: 32, paddingHorizontal: 10, maxWidth: 420 }}>
          <SearchIcon size={14} color={c.secondary} />
          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder="Search the plugin store"
            placeholderTextColor={c.secondary}
            accessibilityLabel="Search the plugin store"
            style={[type.body, { flex: 1, marginLeft: 7, color: c.label, outlineStyle: 'none', height: 30 } as any]}
          />
          {q ? <IconButton icon={X} label="Clear search" size={22} onPress={() => setQ('')} /> : null}
        </View>
      </Target>

      {!cat.loadedOnce && cat.items.length === 0 ? (
        <Spinner label="Loading…" />
      ) : cat.items.length === 0 ? (
        <Empty title="No Plugins" body="Add a GitHub link to the plugin_sources table in Supabase to list a plugin here." />
      ) : query ? (
        filtered.length ? (
          <Grid items={filtered} />
        ) : (
          <Empty title="No Results" body={`Nothing in the store matches “${q.trim()}”.`} action={<Button title="Clear Search" onPress={() => setQ('')} />} />
        )
      ) : (
        <>
          <Shelf id="discover.trending" title="Trending" items={top} />
          <Shelf ruled id="discover.web" title="Web Servers" items={cat.items.filter((i) => i.manifest.category === 'web-servers')} />
          <Shelf ruled id="discover.computing" title="Computing" items={cat.items.filter((i) => i.manifest.category === 'computing')} />
          <Target id="discover.all">
            <SectionHeader ruled title="All Plugins A–Z" />
            <Grid items={az} />
          </Target>
        </>
      )}
      {cat.loading && cat.items.length > 0 ? (
        <View style={{ marginTop: 18 }}>
          <Spinner label="Checking for updates…" />
        </View>
      ) : null}
    </Page>
  );
}

function Grid({ items }: { items: CatalogItem[] }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 28 }}>
      {items.map((it) => (
        <Card key={it.sourceUrl} item={it} />
      ))}
    </View>
  );
}

import { showFocusRing } from '../platform';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Pressable, ScrollView, TextInput, View, type LayoutChangeEvent } from 'react-native';
import { ChevronRight, Search as SearchIcon, X } from 'lucide-react-native';
import { IconButton, T } from '../components/primitives';
import { PluginIcon } from '../components/PluginIcon';
import { useCatalog } from '../catalog';
import { backend, navigate, store, useApp } from '../state';
import { buildIndex, search, type SearchResult } from '../search';
import { radius, type, useTheme } from '../theme';
import { useReducedMotion } from '../platform';
import { iconFor } from './Home';
import { TABS } from '../components/Sidebar';

const BAR_H = 44;
const TOP = 28;

/**
 * Search everything: a single field centred in the window. When you type it glides to the
 * top and a results card rises in beneath it; clear it and both ease back.
 */
export function SearchScreen() {
  const { c, dark } = useTheme();
  const reduced = useReducedMotion();
  const [q, setQ] = useState('');
  const [h, setH] = useState(0);
  const [active, setActive] = useState(0);
  const inputRef = useRef<TextInput>(null);
  const p = useRef(new Animated.Value(0)).current;
  const app = useApp((s) => s);
  const cat = useCatalog();
  const index = useMemo(() => buildIndex(app, cat.items, backend().mode, iconFor), [app.plugins, app.servers, cat.items]);
  const results = useMemo(() => search(index, q), [index, q]);
  const typing = q.trim().length > 0;

  useEffect(() => {
    Animated.timing(p, {
      toValue: typing ? 1 : 0,
      duration: reduced ? 0 : 420,
      easing: Easing.bezier(0.2, 0.8, 0.2, 1),
      useNativeDriver: false,
    }).start();
  }, [typing, reduced]);
  useEffect(() => setActive(0), [q]);
  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, []);

  const centerY = Math.max(TOP, h / 2 - BAR_H / 2 - 40);
  const translateY = p.interpolate({ inputRange: [0, 1], outputRange: [centerY, TOP] });
  const cardOpacity = p.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0, 0, 1] });
  const cardShift = p.interpolate({ inputRange: [0, 1], outputRange: [24, 0] });
  const hintOpacity = p.interpolate({ inputRange: [0, 0.3], outputRange: [1, 0], extrapolate: 'clamp' });

  const go = (r: SearchResult) => {
    navigate(r.tab, r.detail, r.target);
  };

  const onKey = (e: any) => {
    const k = e.nativeEvent.key;
    if (k === 'ArrowDown') (setActive((a) => Math.min(results.length - 1, a + 1)), e.preventDefault?.());
    else if (k === 'ArrowUp') (setActive((a) => Math.max(0, a - 1)), e.preventDefault?.());
    else if (k === 'Escape') setQ('');
  };

  const groups = useMemo(() => {
    const m = new Map<string, SearchResult[]>();
    results.forEach((r) => m.set(r.group, [...(m.get(r.group) ?? []), r]));
    return [...m.entries()];
  }, [results]);
  let flatIndex = -1;

  return (
    <View style={{ flex: 1, backgroundColor: c.window }} onLayout={(e: LayoutChangeEvent) => setH(e.nativeEvent.layout.height)}>
      <Animated.View style={{ position: 'absolute', left: 0, right: 0, top: 0, transform: [{ translateY }], alignItems: 'center', paddingHorizontal: 32, zIndex: 2 }}>
        <View
          style={{
            width: '100%',
            maxWidth: 620,
            height: BAR_H,
            borderRadius: 12,
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 14,
            backgroundColor: dark ? '#2C2C2E' : '#FFFFFF',
            borderWidth: 1,
            borderColor: c.separator,
            boxShadow: `0 8px 28px ${c.shadow}`,
          } as any}
        >
          <SearchIcon size={18} color={c.secondary} />
          <TextInput
            ref={inputRef}
            value={q}
            onChangeText={setQ}
            onKeyPress={onKey}
            onSubmitEditing={() => results[active] && go(results[active])}
            placeholder="Search"
            placeholderTextColor={c.secondary}
            accessibilityLabel="Search everything in EasyServer"
            style={[type.body, { flex: 1, fontSize: 16, marginLeft: 10, color: c.label, height: BAR_H - 2, outlineStyle: 'none' } as any]}
          />
          {typing ? <IconButton icon={X} label="Clear search" size={24} onPress={() => (setQ(''), inputRef.current?.focus())} /> : null}
        </View>
        <Animated.View style={{ opacity: hintOpacity, marginTop: 14 }} pointerEvents="none">
          <T v="callout" color="secondary" style={{ textAlign: 'center' }}>
            Search plugins, settings and logs.
          </T>
        </Animated.View>
      </Animated.View>

      <Animated.View
        pointerEvents={typing ? 'auto' : 'none'}
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: TOP + BAR_H + 14,
          bottom: 24,
          alignItems: 'center',
          paddingHorizontal: 32,
          opacity: cardOpacity,
          transform: [{ translateY: cardShift }],
        }}
      >
        <View
          style={{
            width: '100%',
            maxWidth: 620,
            maxHeight: '100%',
            backgroundColor: dark ? '#262628' : '#FFFFFF',
            borderRadius: radius.l,
            borderWidth: 1,
            borderColor: c.separator,
            boxShadow: `0 12px 40px ${c.shadow}`,
            overflow: 'hidden',
          } as any}
        >
          {results.length === 0 ? (
            <View style={{ padding: 22 }}>
              <T color="secondary" style={{ textAlign: 'center' }}>
                No results for “{q.trim()}”.
              </T>
            </View>
          ) : (
            <ScrollView accessibilityRole={'list' as any} contentContainerStyle={{ paddingVertical: 6 }}>
              <T v="caption" color="secondary" style={{ paddingHorizontal: 16, paddingTop: 6 }} accessibilityLiveRegion={'polite' as any} {...({} as any)}>
                {results.length} result{results.length === 1 ? '' : 's'}
              </T>
              {groups.map(([group, items]) => (
                <View key={group}>
                  <T v="headline" color="secondary" style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 }}>
                    {group}
                  </T>
                  {items.map((r) => {
                    flatIndex++;
                    const i = flatIndex;
                    return <ResultRow key={r.key} r={r} active={i === active} onHover={() => setActive(i)} onPress={() => go(r)} />;
                  })}
                </View>
              ))}
            </ScrollView>
          )}
        </View>
      </Animated.View>
    </View>
  );
}

function ResultRow({ r, active, onPress, onHover }: { r: SearchResult; active: boolean; onPress: () => void; onHover: () => void }) {
  const { c } = useTheme();
  const tabIcon = TABS.find((t) => t.tab === r.tab)!.icon;
  const Icon = tabIcon;
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${r.title}, ${r.subtitle}`}
      onPress={onPress}
      onHoverIn={onHover}
      style={(st: any) => [
        { flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: 6, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 8 },
        active && { backgroundColor: c.accent },
        showFocusRing(st.focused) && ({ outlineColor: c.accent, outlineWidth: 2, outlineStyle: 'solid' } as any),
      ]}
    >
      {r.iconId ? (
        <PluginIcon uri={r.iconUri} id={r.iconId} name={r.title} size={28} />
      ) : (
        <View style={{ width: 28, height: 28, borderRadius: 7, backgroundColor: active ? 'rgba(255,255,255,0.2)' : c.fill, alignItems: 'center', justifyContent: 'center' }}>
          <Icon size={15} color={active ? '#fff' : c.accent} />
        </View>
      )}
      <View style={{ flex: 1 }}>
        <T v="headline" numberOfLines={1} style={active && { color: '#fff' }}>
          {r.title}
        </T>
        <T v="callout" color="secondary" numberOfLines={1} style={active && { color: 'rgba(255,255,255,0.85)' }}>
          {r.subtitle}
        </T>
      </View>
      <ChevronRight size={14} color={active ? '#fff' : c.tertiary} />
    </Pressable>
  );
}

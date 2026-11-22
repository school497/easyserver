import React, { useEffect, useRef } from 'react';
import { Animated, ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { ChevronLeft } from 'lucide-react-native';
import { useTheme } from '../theme';
import { T, IconButton } from './primitives';

/* ───────────── Search targets ─────────────
 * Any element the search can jump to is wrapped in <Target id="…">. After navigation the app
 * calls revealTarget(id): the element scrolls into view (smoothly, through nested and horizontal
 * scroll views) and pulses a soft accent highlight.
 */
const registry = new Map<string, { node: any; pulse: () => void }>();
let reduced = false;
export const setReducedMotion = (v: boolean) => (reduced = v);

export function Target({ id, children, style, radius = 12 }: { id: string; children: React.ReactNode; style?: StyleProp<ViewStyle>; radius?: number }) {
  const { c } = useTheme();
  const ref = useRef<any>(null);
  const glow = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const entry = {
      node: ref.current,
      pulse: () => {
        glow.setValue(0);
        Animated.sequence([
          Animated.timing(glow, { toValue: 1, duration: reduced ? 0 : 220, useNativeDriver: false }),
          Animated.delay(900),
          Animated.timing(glow, { toValue: 0, duration: reduced ? 0 : 600, useNativeDriver: false }),
        ]).start();
      },
    };
    registry.set(id, entry);
    return () => {
      if (registry.get(id) === entry) registry.delete(id);
    };
  }, [id]);
  return (
    <View ref={ref} style={style}>
      {children}
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { margin: -6, borderRadius: radius, backgroundColor: c.highlight, opacity: glow }]}
      />
    </View>
  );
}

export async function revealTarget(id: string, timeoutMs = 2500) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    const t = registry.get(id);
    if (t?.node) {
      const el = t.node as HTMLElement;
      if (typeof el.scrollIntoView === 'function') el.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center', inline: 'center' });
      setTimeout(t.pulse, reduced ? 0 : 380);
      return true;
    }
    await new Promise((r) => setTimeout(r, 60));
  }
  return false;
}

/* ───────────── Page scaffolding ───────────── */

export function Page({
  title,
  subtitle,
  right,
  children,
  onBack,
  scroll = true,
  maxWidth = 1100,
}: {
  title?: string;
  subtitle?: React.ReactNode;
  right?: React.ReactNode;
  children: React.ReactNode;
  onBack?: () => void;
  scroll?: boolean;
  maxWidth?: number;
}) {
  const { c } = useTheme();
  const body = (
    <View style={{ paddingHorizontal: 32, paddingBottom: 48, paddingTop: onBack ? 8 : 28, width: '100%', maxWidth, alignSelf: 'center' }}>
      {title ? (
        <View style={{ marginBottom: 22 }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', paddingBottom: 14 }}>
            <View style={{ flexShrink: 1 }}>
              <T v="largeTitle" accessibilityRole="header">
                {title}
              </T>
              {subtitle ? <View style={{ marginTop: 3 }}>{typeof subtitle === 'string' ? <T color="secondary">{subtitle}</T> : subtitle}</View> : null}
            </View>
            {right}
          </View>
          {/* App Store–style hairline under the page title */}
          <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: c.separator }} />
        </View>
      ) : null}
      {children}
    </View>
  );
  return (
    <View style={{ flex: 1, backgroundColor: c.window }}>
      {onBack ? <TopBar onBack={onBack} /> : <View style={{ height: 0 }} />}
      {scroll ? (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1 }}>
          {body}
        </ScrollView>
      ) : (
        body
      )}
    </View>
  );
}

/** Thin top bar with an icon-only back button (labelled "Back" for screen readers). */
export function TopBar({ onBack, children }: { onBack: () => void; children?: React.ReactNode }) {
  const { c } = useTheme();
  return (
    <View
      {...({ dataSet: { drag: '1' } } as any)}
      style={{ height: 44, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.separator }}
    >
      <View {...({ dataSet: { nodrag: '1' } } as any)}>
        <IconButton icon={ChevronLeft} label="Back" onPress={onBack} size={30} color={c.accentText} />
      </View>
      {children}
    </View>
  );
}

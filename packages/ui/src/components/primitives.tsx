import { showFocusRing } from '../platform';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  type PressableProps,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { type Colors, fonts, radius, type, useTheme } from '../theme';

type Variant = keyof typeof type;

export function T({
  v = 'body',
  color,
  style,
  children,
  numberOfLines,
  selectable,
  accessibilityRole,
}: {
  accessibilityRole?: any;
  v?: Variant;
  color?: keyof Colors;
  style?: StyleProp<TextStyle>;
  children: React.ReactNode;
  numberOfLines?: number;
  selectable?: boolean;
}) {
  const { c } = useTheme();
  return (
    <Text accessibilityRole={accessibilityRole} numberOfLines={numberOfLines} selectable={selectable} style={[type[v], { color: c[color ?? 'label'] }, style]}>
      {children}
    </Text>
  );
}

type ButtonKind = 'primary' | 'secondary' | 'get' | 'plain' | 'destructive';

export function Button({
  title,
  kind = 'secondary',
  onPress,
  disabled,
  loading,
  icon: Icon,
  style,
  accessibilityLabel,
  small,
}: {
  title?: string;
  kind?: ButtonKind;
  onPress?: PressableProps['onPress'];
  disabled?: boolean;
  loading?: boolean;
  icon?: React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  small?: boolean;
}) {
  const { c } = useTheme();
  const palette: Record<ButtonKind, { bg: string; fg: string; hover: string }> = {
    primary: { bg: c.accent, fg: c.onAccent, hover: c.accent },
    secondary: { bg: c.button, fg: c.label, hover: c.buttonHover },
    get: { bg: c.getFill, fg: c.accentText, hover: c.fillStrong },
    plain: { bg: 'transparent', fg: c.accentText, hover: c.fill },
    destructive: { bg: c.button, fg: c.redText, hover: c.buttonHover },
  };
  const p = palette[kind];
  const isGet = kind === 'get';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled: !!disabled, busy: !!loading }}
      disabled={disabled || loading}
      onPress={onPress}
      style={(st: any) => [
        styles.button,
        isGet && styles.get,
        small && styles.small,
        { backgroundColor: st.hovered || st.pressed ? p.hover : p.bg },
        kind === 'primary' && (st.hovered || st.pressed) && { opacity: 0.88 },
        st.focused && { outlineColor: c.accent, outlineWidth: 3, outlineStyle: 'solid', outlineOffset: 1 } as any,
        (disabled || loading) && { opacity: 0.45 },
        style,
      ]}
    >
      {loading ? <ActivityIndicator size="small" color={p.fg} style={{ transform: [{ scale: 0.7 }] }} /> : Icon ? <Icon size={small ? 13 : 14} color={p.fg} strokeWidth={2.2} /> : null}
      {title ? (
        <Text style={[isGet ? styles.getText : type.headline, { color: p.fg }, (Icon || loading) && { marginLeft: 6 }]} numberOfLines={1}>
          {isGet ? title.toUpperCase() : title}
        </Text>
      ) : null}
    </Pressable>
  );
}

export function IconButton({
  icon: Icon,
  label,
  onPress,
  size = 28,
  color,
}: {
  icon: React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
  label: string;
  onPress: () => void;
  size?: number;
  color?: string;
}) {
  const { c } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={(st: any) => [
        { width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center' },
        (st.hovered || st.pressed) && { backgroundColor: c.fill },
        showFocusRing(st.focused) && ({ outlineColor: c.accent, outlineWidth: 3, outlineStyle: 'solid' } as any),
      ]}
    >
      <Icon size={Math.round(size * 0.62)} color={color ?? c.secondary} strokeWidth={2} />
    </Pressable>
  );
}

export const statusInfo = (status: string) =>
  ({
    running: { label: 'Running', tone: 'green' as const },
    stopped: { label: 'Stopped', tone: 'red' as const },
    starting: { label: 'Starting…', tone: 'orange' as const },
    stopping: { label: 'Stopping…', tone: 'orange' as const },
    installing: { label: 'Installing…', tone: 'orange' as const },
    error: { label: 'Error', tone: 'red' as const },
  })[status] ?? { label: status, tone: 'red' as const };

/** Status is always dot + text, never color alone. */
export function StatusLabel({ status, label, v = 'callout' }: { status: 'green' | 'red' | 'orange'; label: string; v?: Variant }) {
  const { c } = useTheme();
  const dot = { green: c.green, red: c.red, orange: c.orange }[status];
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: dot, marginRight: 6 }} />
      <T v={v} color="secondary">
        {label}
      </T>
    </View>
  );
}

export function Card({ children, style, padded = true }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; padded?: boolean }) {
  const { c } = useTheme();
  return <View style={[{ backgroundColor: c.card, borderRadius: radius.l, borderWidth: StyleSheet.hairlineWidth, borderColor: c.cardBorder }, padded && { padding: 16 }, style]}>{children}</View>;
}

/** Shelf heading. `ruled` draws the hairline the App Store puts between shelves. */
export function SectionHeader({ title, right, style, ruled }: { title: string; right?: React.ReactNode; style?: StyleProp<ViewStyle>; ruled?: boolean }) {
  const { c } = useTheme();
  return (
    <View style={style}>
      {ruled ? <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: c.separator, marginBottom: 18 }} /> : null}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <T v="title2" accessibilityRole="header" style={{ flexShrink: 1 }}>
          {title}
        </T>
        {right}
      </View>
    </View>
  );
}

export function Separator({ inset = 0, style }: { inset?: number; style?: StyleProp<ViewStyle> }) {
  const { c } = useTheme();
  return <View style={[{ height: StyleSheet.hairlineWidth, backgroundColor: c.separator, marginLeft: inset }, style]} />;
}

export function Field(props: TextInputProps & { label?: string; hint?: string; error?: string | null }) {
  const { c } = useTheme();
  const [focus, setFocus] = useState(false);
  const { label, hint, error, style, ...rest } = props;
  return (
    <View style={{ marginBottom: 12 }}>
      {label ? (
        <T v="headline" style={{ marginBottom: 6 }}>
          {label}
        </T>
      ) : null}
      <TextInput
        placeholderTextColor={c.tertiary}
        {...rest}
        onFocus={(e) => (setFocus(true), rest.onFocus?.(e))}
        onBlur={(e) => (setFocus(false), rest.onBlur?.(e))}
        style={[
          type.body,
          {
            color: c.label,
            backgroundColor: c.window,
            borderWidth: 1,
            borderColor: error ? c.red : focus ? c.accent : c.separator,
            borderRadius: radius.s,
            paddingHorizontal: 9,
            height: 28,
            outlineStyle: 'none',
          } as any,
          focus && ({ boxShadow: `0 0 0 3px ${c.highlight}` } as any),
          style,
        ]}
      />
      {error ? (
        <T v="caption" color="redText" style={{ marginTop: 4 }}>
          {error}
        </T>
      ) : hint ? (
        <T v="caption" color="secondary" style={{ marginTop: 4 }}>
          {hint}
        </T>
      ) : null}
    </View>
  );
}

export function Toggle({ value, onValueChange, label, disabled }: { value: boolean; onValueChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  const { c } = useTheme();
  return (
    <Switch
      accessibilityLabel={label}
      value={value}
      disabled={disabled}
      onValueChange={onValueChange}
      trackColor={{ true: c.accent, false: c.fillStrong }}
      thumbColor="#FFFFFF"
      {...({ activeThumbColor: '#FFFFFF' } as any)}
    />
  );
}

export function Segmented<V extends string>({ value, options, onChange, label }: { value: V; options: { label: string; value: V }[]; onChange: (v: V) => void; label: string }) {
  const { c } = useTheme();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={{ flexDirection: 'row', backgroundColor: c.fill, borderRadius: 7, padding: 2, alignSelf: 'flex-start', flexWrap: 'wrap' }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            onPress={() => onChange(o.value)}
            style={(st: any) => [
              { paddingHorizontal: 12, height: 24, justifyContent: 'center', borderRadius: 5 },
              on && { backgroundColor: c.segmentOn, boxShadow: `0 1px 2px ${c.shadow}` } as any,
              showFocusRing(st.focused) && ({ outlineColor: c.accent, outlineWidth: 2, outlineStyle: 'solid' } as any),
            ]}
          >
            <T v={on ? 'headline' : 'body'}>{o.label}</T>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Row({ label, value, children, last }: { label: string; value?: React.ReactNode; children?: React.ReactNode; last?: boolean }) {
  return (
    <>
      <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 36, paddingVertical: 6, gap: 12 }}>
        <T style={{ flex: 1 }}>{label}</T>
        {value != null ? (
          typeof value === 'string' ? (
            <T color="secondary" selectable numberOfLines={1} style={{ flexShrink: 1, textAlign: 'right' }}>
              {value}
            </T>
          ) : (
            value
          )
        ) : null}
        {children}
      </View>
      {!last && <Separator />}
    </>
  );
}

export function Mono({ lines, empty = 'Nothing here yet.' }: { lines: string[]; empty?: string }) {
  const { c } = useTheme();
  return (
    <View style={{ backgroundColor: c.mono, borderRadius: radius.m, padding: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: c.cardBorder }}>
      <Text selectable style={[type.mono, { color: lines.length ? c.label : c.secondary }]}>
        {lines.length ? lines.join('\n') : empty}
      </Text>
    </View>
  );
}

export function Spinner({ label }: { label?: string }) {
  const { c } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }} accessibilityLiveRegion="polite">
      <ActivityIndicator size="small" color={c.secondary} />
      {label ? <T color="secondary">{label}</T> : null}
    </View>
  );
}

export function Empty({ title, body, action }: { title: string; body: string; action?: React.ReactNode }) {
  return (
    <View style={{ alignItems: 'center', paddingVertical: 64, paddingHorizontal: 24 }}>
      <T v="title2" style={{ textAlign: 'center', marginBottom: 6 }}>
        {title}
      </T>
      <T color="secondary" style={{ textAlign: 'center', maxWidth: 380, marginBottom: action ? 18 : 0 }}>
        {body}
      </T>
      {action}
    </View>
  );
}

const styles = StyleSheet.create({
  button: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', height: 28, paddingHorizontal: 14, borderRadius: radius.s, cursor: 'pointer' } as any,
  small: { height: 24, paddingHorizontal: 10 },
  get: { borderRadius: 999, minWidth: 72, height: 26, paddingHorizontal: 16 },
  getText: { fontSize: 12.5, fontWeight: '800', letterSpacing: 0.3, fontFamily: fonts.system },
});

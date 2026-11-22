import React, { useRef, useState } from 'react';
import { Pressable, TextInput, View, type LayoutChangeEvent } from 'react-native';
import { Eye, EyeOff, FileUp, Plus, X } from 'lucide-react-native';
import type { SettingField } from '@easyserver/core';
import { Button, Field, IconButton, Row, Segmented, T, Toggle } from './primitives';
import { radius, type, useTheme } from '../theme';
import { showFocusRing } from '../platform';

/**
 * One control per manifest setting type. Plugin developers pick the type; the app draws a native-
 * feeling control for it. Values are re-validated on the server (sanitizeSettings).
 */
export function SettingInput({
  field: f,
  value,
  onChange,
  onPickFile,
  uploading,
}: {
  field: SettingField;
  value: any;
  onChange: (v: any) => void;
  /** file type: uploads the chosen file and resolves to its name. */
  onPickFile?: () => Promise<string | null>;
  uploading?: boolean;
}) {
  const { c } = useTheme();
  const label = f.required ? `${f.label} *` : f.label;
  const hint = f.description ?? (f.pattern ? f.patternHint : undefined);

  switch (f.type) {
    case 'boolean':
      return (
        <View style={{ marginBottom: 8 }}>
          <Row label={label} last>
            <Toggle label={f.label} value={!!value} onValueChange={onChange} />
          </Row>
          {hint ? (
            <T v="caption" color="secondary" style={{ marginTop: -2, marginBottom: 6 }}>
              {hint}
            </T>
          ) : null}
        </View>
      );
    case 'select':
      return (
        <LabeledBox label={label} hint={hint}>
          <Segmented label={f.label} value={String(value)} options={f.options!} onChange={onChange} />
        </LabeledBox>
      );
    case 'multiselect': {
      const set = new Set<string>(Array.isArray(value) ? value : []);
      return (
        <LabeledBox label={label} hint={hint}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }} accessibilityRole={'group' as any} accessibilityLabel={f.label}>
            {f.options!.map((o) => {
              const on = set.has(o.value);
              return (
                <Pressable
                  key={o.value}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                  onPress={() => {
                    const next = new Set(set);
                    on ? next.delete(o.value) : next.add(o.value);
                    onChange(f.options!.map((x) => x.value).filter((x) => next.has(x)));
                  }}
                  style={(st: any) => [
                    { height: 26, paddingHorizontal: 12, borderRadius: 13, justifyContent: 'center', borderWidth: 1 },
                    on ? { backgroundColor: c.accent, borderColor: c.accent } : { backgroundColor: c.window, borderColor: c.separator },
                    showFocusRing(st.focused) && ({ outlineColor: c.accent, outlineWidth: 2, outlineStyle: 'solid' } as any),
                  ]}
                >
                  <T v="headline" style={{ color: on ? '#fff' : c.label }}>
                    {o.label}
                  </T>
                </Pressable>
              );
            })}
          </View>
        </LabeledBox>
      );
    }
    case 'list':
      return (
        <LabeledBox label={label} hint={hint}>
          <ListEditor field={f} value={Array.isArray(value) ? value : []} onChange={onChange} />
        </LabeledBox>
      );
    case 'slider':
      return (
        <LabeledBox label={label} hint={hint}>
          <Slider field={f} value={Number(value)} onChange={onChange} />
        </LabeledBox>
      );
    case 'color':
      return (
        <LabeledBox label={label} hint={hint}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View accessible={false} style={{ width: 28, height: 28, borderRadius: 6, backgroundColor: /^#[0-9a-f]{6}$/i.test(value) ? value : 'transparent', borderWidth: 1, borderColor: c.separator }} />
            <View style={{ width: 120 }}>
              <Field value={String(value ?? '')} onChangeText={(t) => onChange(t.startsWith('#') ? t : `#${t}`)} maxLength={7} autoCapitalize="none" accessibilityLabel={f.label} style={{ marginBottom: -12 }} />
            </View>
          </View>
        </LabeledBox>
      );
    case 'text':
      return (
        <LabeledBox label={label} hint={hint}>
          <TextInput
            multiline
            value={String(value ?? '')}
            onChangeText={onChange}
            placeholder={f.placeholder}
            placeholderTextColor={c.tertiary}
            accessibilityLabel={f.label}
            numberOfLines={f.rows ?? 4}
            style={[
              type.mono,
              { color: c.label, backgroundColor: c.window, borderWidth: 1, borderColor: c.separator, borderRadius: radius.s, padding: 8, minHeight: (f.rows ?? 4) * 17 + 16, outlineStyle: 'none', maxWidth: 620 } as any,
            ]}
          />
        </LabeledBox>
      );
    case 'password':
      return <Secret field={f} label={label} hint={hint} value={value} onChange={onChange} />;
    case 'file':
      return (
        <LabeledBox label={label} hint={hint}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <T color={value ? 'label' : 'secondary'} numberOfLines={1} style={{ flexShrink: 1 }}>
              {value || 'No file chosen'}
            </T>
            <Button
              small
              icon={FileUp}
              title={value ? 'Replace…' : 'Choose File…'}
              loading={uploading}
              onPress={async () => {
                const name = await onPickFile?.();
                if (name) onChange(name);
              }}
            />
            {value ? <Button small kind="plain" title="Clear" onPress={() => onChange('')} /> : null}
          </View>
        </LabeledBox>
      );
    default: {
      // string, number, port, email, url, path
      const numeric = f.type === 'number' || f.type === 'port';
      return (
        <View style={{ marginBottom: 2 }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
            <View style={{ flex: numeric ? undefined : 1, width: numeric ? 140 : undefined, maxWidth: 520 }}>
              <Field
                label={label}
                hint={hint}
                placeholder={f.placeholder}
                value={value == null ? '' : String(value)}
                onChangeText={(t) => onChange(numeric ? t.replace(/[^\d.-]/g, '') : t)}
                inputMode={numeric ? 'decimal' : f.type === 'email' ? 'email' : f.type === 'url' ? 'url' : 'text'}
                autoCapitalize={f.type === 'string' ? 'sentences' : 'none'}
                autoCorrect={f.type === 'string'}
                style={f.type === 'path' ? { fontFamily: type.mono.fontFamily } : undefined}
              />
            </View>
            {f.unit ? (
              <T color="secondary" style={{ marginBottom: hint ? 30 : 18 }}>
                {f.unit}
              </T>
            ) : null}
          </View>
        </View>
      );
    }
  }
}

function Secret({ field: f, label, hint, value, onChange }: { field: SettingField; label: string; hint?: string; value: any; onChange: (v: any) => void }) {
  const [show, setShow] = useState(false);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 6 }}>
      <View style={{ flex: 1, maxWidth: 420 }}>
        <Field label={label} hint={hint} placeholder={f.placeholder} value={String(value ?? '')} onChangeText={onChange} secureTextEntry={!show} autoComplete="off" autoCapitalize="none" />
      </View>
      <View style={{ marginBottom: hint ? 30 : 12 }}>
        <IconButton icon={show ? EyeOff : Eye} label={show ? `Hide ${f.label}` : `Show ${f.label}`} onPress={() => setShow((s) => !s)} />
      </View>
    </View>
  );
}

function ListEditor({ field: f, value, onChange }: { field: SettingField; value: string[]; onChange: (v: string[]) => void }) {
  const { c } = useTheme();
  const [draft, setDraft] = useState('');
  const full = !!f.maxItems && value.length >= f.maxItems;
  const add = () => {
    const t = draft.trim();
    if (!t || full) return;
    onChange([...value, t]);
    setDraft('');
  };
  return (
    <View style={{ maxWidth: 520, borderWidth: 1, borderColor: c.separator, borderRadius: radius.m, overflow: 'hidden' }}>
      {value.map((item, i) => (
        <View key={`${i}:${item}`} style={{ flexDirection: 'row', alignItems: 'center', paddingLeft: 10, minHeight: 32, borderBottomWidth: 1, borderBottomColor: c.separator }}>
          <T selectable numberOfLines={1} style={{ flex: 1 }}>
            {item}
          </T>
          <IconButton icon={X} size={24} label={`Remove ${item}`} onPress={() => onChange(value.filter((_, j) => j !== i))} />
        </View>
      ))}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingLeft: 10 }}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          onSubmitEditing={add}
          editable={!full}
          placeholder={full ? `Up to ${f.maxItems} items` : f.placeholder ?? 'Add an item'}
          placeholderTextColor={c.tertiary}
          accessibilityLabel={`Add to ${f.label}`}
          style={[type.body, { flex: 1, height: 32, color: c.label, outlineStyle: 'none' } as any]}
        />
        <IconButton icon={Plus} size={24} label={`Add to ${f.label}`} onPress={add} color={c.accentText} />
      </View>
    </View>
  );
}

/** Track slider built on the responder system, with arrow-key support for keyboard users. */
function Slider({ field: f, value, onChange }: { field: SettingField; value: number; onChange: (v: number) => void }) {
  const { c } = useTheme();
  const min = f.min ?? 0;
  const max = f.max ?? 100;
  const step = f.step ?? 1;
  const width = useRef(1);
  const v = Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : min;
  const pct = (v - min) / (max - min || 1);
  const set = (x: number) => {
    const raw = min + Math.min(1, Math.max(0, x / width.current)) * (max - min);
    onChange(Number((Math.round(raw / step) * step).toFixed(6)));
  };
  const nudge = (dir: number) => onChange(Math.min(max, Math.max(min, Number((v + dir * step).toFixed(6)))));
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, maxWidth: 520 }}>
      <View
        accessible
        focusable
        accessibilityRole="adjustable"
        accessibilityLabel={f.label}
        accessibilityValue={{ min, max, now: v, text: `${v}${f.unit ? ' ' + f.unit : ''}` }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(e) => nudge(e.nativeEvent.actionName === 'increment' ? 1 : -1)}
        {...({ onKeyDown: (e: any) => (e.key === 'ArrowRight' || e.key === 'ArrowUp' ? nudge(1) : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? nudge(-1) : null) } as any)}
        onLayout={(e: LayoutChangeEvent) => (width.current = e.nativeEvent.layout.width)}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={(e) => set(e.nativeEvent.locationX)}
        onResponderMove={(e) => set(e.nativeEvent.locationX)}
        style={{ flex: 1, height: 24, justifyContent: 'center', cursor: 'pointer' } as any}
      >
        <View pointerEvents="none" style={{ height: 4, borderRadius: 2, backgroundColor: c.fillStrong }}>
          <View style={{ width: `${pct * 100}%`, height: 4, borderRadius: 2, backgroundColor: c.accent }} />
        </View>
        <View
          pointerEvents="none"
          style={{ position: 'absolute', left: `${pct * 100}%`, marginLeft: -10, width: 20, height: 20, borderRadius: 10, backgroundColor: '#fff', boxShadow: `0 1px 4px ${c.shadow}`, borderWidth: 0.5, borderColor: c.separator } as any}
        />
      </View>
      <T style={{ minWidth: 72, textAlign: 'right', fontVariant: ['tabular-nums'] }}>
        {v}
        {f.unit ? `${/^[A-Za-z]/.test(f.unit) ? ' ' : ''}${f.unit}` : ''}
      </T>
    </View>
  );
}

function LabeledBox({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <View style={{ marginBottom: 14 }}>
      <T v="headline" style={{ marginBottom: 6 }}>
        {label}
      </T>
      {children}
      {hint ? (
        <T v="caption" color="secondary" style={{ marginTop: 4 }}>
          {hint}
        </T>
      ) : null}
    </View>
  );
}

import React, { useRef, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { fonts, useTheme } from '../theme';
import { T } from './primitives';

const LETTERS = /[^A-HJ-NP-Z]/g; // codes never use I or O

/** Six letter boxes driven by one hidden field, so paste, delete and screen readers all just work. */
export function CodeInput({ value, onChange, onSubmit, autoFocus, error }: { value: string; onChange: (v: string) => void; onSubmit?: () => void; autoFocus?: boolean; error?: boolean }) {
  const { c } = useTheme();
  const ref = useRef<TextInput>(null);
  const [focused, setFocused] = useState(!!autoFocus);
  return (
    <Pressable accessible={false} onPress={() => ref.current?.focus()} style={{ cursor: 'text' } as any}>
      <View style={{ flexDirection: 'row', gap: 8, justifyContent: 'center' }}>
        {Array.from({ length: 6 }).map((_, i) => {
          const ch = value[i] ?? '';
          const active = focused && (i === value.length || (i === 5 && value.length === 6));
          return (
            <View
              key={i}
              style={{
                width: 46,
                height: 56,
                borderRadius: 10,
                borderWidth: active ? 2 : 1,
                borderColor: error ? c.red : active ? c.accent : c.separator,
                backgroundColor: c.window,
                alignItems: 'center',
                justifyContent: 'center',
                marginRight: i === 2 ? 10 : 0,
              }}
            >
              <T style={{ fontSize: 26, fontWeight: '600', fontFamily: fonts.mono }}>{ch}</T>
            </View>
          );
        })}
      </View>
      <TextInput
        ref={ref}
        value={value}
        autoFocus={autoFocus}
        accessibilityLabel="Six-letter pairing code"
        autoCapitalize="characters"
        autoCorrect={false}
        autoComplete="one-time-code"
        maxLength={6}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onChangeText={(t) => onChange(t.toUpperCase().replace(LETTERS, '').slice(0, 6))}
        onSubmitEditing={onSubmit}
        style={{ position: 'absolute', opacity: 0, width: '100%', height: '100%', left: 0, top: 0 } as any}
      />
    </Pressable>
  );
}

/** Read-only version for the server: big, spaced, selectable. */
export function CodeDisplay({ code }: { code: string }) {
  const { c } = useTheme();
  return (
    <View accessible accessibilityLabel={`Pairing code ${code.split('').join(' ')}`} style={{ flexDirection: 'row', gap: 8, justifyContent: 'center' }}>
      {code.split('').map((ch, i) => (
        <View
          key={i}
          style={{ width: 54, height: 66, borderRadius: 12, backgroundColor: c.fill, alignItems: 'center', justifyContent: 'center', marginRight: i === 2 ? 12 : 0 }}
        >
          <T selectable style={{ fontSize: 32, fontWeight: '700', fontFamily: fonts.mono }}>
            {ch}
          </T>
        </View>
      ))}
    </View>
  );
}

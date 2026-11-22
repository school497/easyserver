import React, { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { radius, useTheme } from '../theme';
import { Button, T } from './primitives';

/**
 * In-window sheet: blurs and dims the app behind it, closes on Escape.
 * One at a time (modality.md › "Let people dismiss a modal view before presenting another one").
 */
export function Sheet({
  title,
  message,
  children,
  onClose,
  width = 420,
  dismissable = true,
}: {
  title: string;
  message?: string;
  children?: React.ReactNode;
  onClose: () => void;
  width?: number;
  dismissable?: boolean;
}) {
  const { c, dark } = useTheme();
  useEffect(() => {
    if (!dismissable || typeof window === 'undefined') return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dismissable, onClose]);
  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: 100, alignItems: 'center', justifyContent: 'center', padding: 16 }]}>
      <Pressable
        accessibilityLabel="Close"
        accessible={false}
        onPress={dismissable ? onClose : undefined}
        {...({ dataSet: { blur: '1' } } as any)}
        style={[StyleSheet.absoluteFill, { backgroundColor: c.overlay, cursor: 'default' } as any]}
      />
      <View
        accessibilityViewIsModal
        accessibilityRole={'dialog' as any}
        accessibilityLabel={title}
        style={{
          width: '100%',
          maxWidth: width,
          backgroundColor: dark ? '#2C2C2E' : '#FFFFFF',
          borderRadius: radius.l,
          padding: 22,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: c.cardBorder,
          boxShadow: `0 24px 64px ${c.shadow}, 0 2px 8px ${c.shadow}`,
        } as any}
      >
        <T v="title2" style={{ marginBottom: message ? 6 : 14 }}>
          {title}
        </T>
        {message ? (
          <T color="secondary" style={{ marginBottom: 16 }}>
            {message}
          </T>
        ) : null}
        {children}
      </View>
    </View>
  );
}

export function SheetButtons({ children }: { children: React.ReactNode }) {
  return <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>{children}</View>;
}

/** Confirmation for destructive, irreversible actions: Cancel is the default, the action is red. */
export function Confirm({
  title,
  message,
  confirmLabel,
  onConfirm,
  onCancel,
  destructive = true,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  destructive?: boolean;
}) {
  return (
    <Sheet title={title} message={message} onClose={onCancel} width={380}>
      <SheetButtons>
        <Button title="Cancel" onPress={onCancel} />
        <Button title={confirmLabel} kind={destructive ? 'destructive' : 'primary'} onPress={onConfirm} />
      </SheetButtons>
    </Sheet>
  );
}

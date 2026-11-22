import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, Text, View } from 'react-native';
import { ArrowDown, Check } from 'lucide-react-native';
import { fonts, useTheme } from '../theme';
import { showFocusRing, useReducedMotion } from '../platform';

/**
 * Pill install button. Idle: accent circle with a down arrow and a label. On press the button
 * dips, the arrow turns to point right while the label becomes "Installing", the circle stretches
 * into a bar that counts up to 100%, turns green with a check, shrinks into a circle on the right
 * beside "Done", then the whole button zooms out and comes back as "Open".
 */
export type InstallPhase = 'idle' | 'installing' | 'installed';

export function InstallButton({
  phase,
  progress,
  onInstall,
  onOpen,
  disabled,
  large,
  name,
}: {
  phase: InstallPhase;
  /** 0–1 while installing. */
  progress: number;
  onInstall: () => void;
  onOpen: () => void;
  disabled?: boolean;
  large?: boolean;
  name: string;
}) {
  const { c, dark } = useTheme();
  const reduced = useReducedMotion();
  const H = large ? 38 : 30;
  const W = large ? 156 : 122;
  const inset = Math.round(H * 0.157);
  const D = H - inset * 2;
  const full = W - inset * 2;
  const fontSize = large ? 15 : 13;
  // Whole-pixel icon with the same parity as the circle, so it sits exactly centred at any display scale.
  const iconSize = Math.round((D * 0.6) / 2) * 2 + (D % 2);
  const ms = (n: number) => (reduced ? Math.round(n * 0.6) : n);

  // What the button is drawing; lags `phase` while animations play.
  const [view, setView] = useState<'idle' | 'busy' | 'done' | 'open'>(phase === 'installed' ? 'open' : phase === 'installing' ? 'busy' : 'idle');
  const [pct, setPct] = useState(0);
  const press = useRef(new Animated.Value(1)).current;
  const rot = useRef(new Animated.Value(phase === 'idle' ? 0 : 1)).current; // 0 ↓  1 →
  const swap = useRef(new Animated.Value(phase === 'installing' ? 1 : 0)).current; // label crossfade
  const fill = useRef(new Animated.Value(phase === 'installing' ? 1 : 0)).current; // circle → bar
  const done = useRef(new Animated.Value(0)).current; // accent → green, arrow → check
  const shrink = useRef(new Animated.Value(0)).current; // bar → circle on the right
  const swapOut = useRef(new Animated.Value(1)).current; // whole-button zoom in/out
  const prev = useRef(phase);
  const pctRef = useRef(0);

  const t = (v: Animated.Value, toValue: number, duration: number, easing = Easing.bezier(0.25, 0.1, 0.25, 1)) =>
    Animated.timing(v, { toValue, duration: ms(duration), easing, useNativeDriver: false });

  // Percentage display follows the real progress, eased so it never jumps backwards.
  useEffect(() => {
    if (view !== 'busy') return;
    const id = setInterval(() => {
      const target = Math.min(1, progress);
      pctRef.current += Math.max(0, target - pctRef.current) * (target >= 1 ? 0.45 : 0.12);
      setPct(Math.round(pctRef.current * 100));
    }, 60);
    return () => clearInterval(id);
  }, [view, progress]);

  useEffect(() => {
    const from = prev.current;
    prev.current = phase;
    if (from === phase) return;
    if (phase === 'installing') {
      pctRef.current = 0;
      setPct(0);
      setView('busy');
      Animated.sequence([
        Animated.parallel([t(rot, 1, 260, Easing.bezier(0.3, 0, 0.2, 1)), t(swap, 1, 360)]),
        Animated.delay(ms(220)),
        t(fill, 1, 380, Easing.bezier(0.65, 0, 0.35, 1)),
      ]).start();
    } else if (phase === 'installed') {
      // Count to 100, turn green, collapse into the check, then come back as "Open".
      const finish = () => {
        pctRef.current = 1;
        setPct(100);
        Animated.sequence([
          Animated.delay(ms(180)),
          t(done, 1, 260),
          t(shrink, 1, 380, Easing.bezier(0.65, 0, 0.35, 1)),
          Animated.delay(ms(1300)),
          t(swapOut, 0, 220, Easing.in(Easing.cubic)),
        ]).start(() => {
          setView('open');
          rot.setValue(1);
          swap.setValue(0);
          fill.setValue(0);
          done.setValue(0);
          shrink.setValue(0);
          t(swapOut, 1, 340, Easing.out(Easing.cubic)).start();
        });
      };
      if (from === 'installing') {
        setView('busy');
        const wait = setInterval(() => {
          if (pctRef.current > 0.97) {
            clearInterval(wait);
            setView('done');
            finish();
          }
        }, 60);
      } else setView('open');
    } else {
      // Failed or removed: unwind back to the idle button.
      Animated.parallel([t(shrink, 0, 200), t(done, 0, 200), t(fill, 0, 320), t(swap, 0, 320), t(rot, 0, 320)]).start(() => setView('idle'));
    }
  }, [phase]);

  const onPressIn = () => !reduced && Animated.spring(press, { toValue: 0.93, useNativeDriver: false, speed: 40, bounciness: 0 }).start();
  const onPressOut = () => !reduced && Animated.spring(press, { toValue: 1, useNativeDriver: false, speed: 18, bounciness: 8 }).start();

  const width = Animated.subtract(Animated.add(D, Animated.multiply(fill, full - D)), Animated.multiply(shrink, full - D));
  const left = Animated.add(inset, Animated.multiply(shrink, full - D));
  const iconLeft = Animated.add(left, Animated.subtract(width, D));
  // (left, width and D are whole pixels at rest, so the icon box lands on the pixel grid.)
  const accent = c.accent;
  const green = dark ? '#30D158' : '#22C55E';
  const bg = done.interpolate({ inputRange: [0, 1], outputRange: [accent, green] });
  const labelColor = c.label;
  const isOpen = view === 'open';
  const busyLabel = 'Installing';
  const idleLabel = isOpen ? 'Open' : 'Install';
  const textStyle = { fontSize, fontWeight: '500' as const, letterSpacing: -0.2, fontFamily: fonts.system, color: labelColor };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={view === 'busy' ? `Installing ${name}, ${pct} percent` : view === 'done' ? `${name} installed` : isOpen ? `Open ${name}` : `Install ${name}`}
      accessibilityState={{ disabled: !!disabled && !isOpen, busy: view === 'busy' }}
      disabled={(!!disabled && !isOpen) || view === 'busy' || view === 'done'}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      onPress={isOpen ? onOpen : onInstall}
      style={(st: any) => [{ borderRadius: H / 2 }, showFocusRing(st.focused) && ({ outlineColor: c.accent, outlineWidth: 2, outlineStyle: 'solid', outlineOffset: 2 } as any)]}
    >
      {({ hovered }: any) => (
        <Animated.View
          style={{
            width: W,
            height: H,
            borderRadius: H / 2,
            opacity: Animated.multiply(swapOut, disabled && !isOpen ? 0.45 : 1),
            transform: [{ scale: reduced ? 1 : Animated.multiply(press, swapOut.interpolate({ inputRange: [0, 1], outputRange: [0.72, 1] })) }],
            filter: reduced ? undefined : swapOut.interpolate({ inputRange: [0, 1], outputRange: ['blur(5px)', 'blur(0px)'] }),
            backgroundImage: dark
              ? `linear-gradient(160deg, ${hovered ? '#55555A' : '#4A4A4E'} 0%, #3A3A3C 48%, #2C2C2E 100%)`
              : `linear-gradient(160deg, #FFFFFF 0%, ${hovered ? '#F7F7F7' : '#F3F3F3'} 45%, #E3E3E3 100%)`,
            boxShadow: dark
              ? '0 0 0 0.5px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.12), 0 1px 2px rgba(0,0,0,0.4)'
              : '0 0 0 0.5px rgba(0,0,0,0.13), inset 0 1px 0 #FFFFFF, inset 0 0 0 1px rgba(255,255,255,0.7), 0 1px 2px rgba(0,0,0,0.07)',
            overflow: 'hidden',
          } as any}
        >
          {/* Labels on the pill */}
          <View pointerEvents="none" style={{ position: 'absolute', left: inset + D + (large ? 10 : 8), top: 0, bottom: 0, justifyContent: 'center' }}>
            <Animated.Text numberOfLines={1} style={[textStyle, { opacity: swap.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 0.35, 0] }) }]}>
              {idleLabel}
            </Animated.Text>
            <Animated.Text
              numberOfLines={1}
              style={[textStyle, { position: 'absolute', opacity: Animated.multiply(swap.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 0.25, 1] }), Animated.subtract(1, shrink)) }]}
            >
              {busyLabel}
            </Animated.Text>
          </View>
          <Animated.View pointerEvents="none" style={{ position: 'absolute', left: 0, width: W - H + inset, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', opacity: shrink }}>
            <Text style={textStyle}>Done</Text>
          </Animated.View>

          {/* Accent circle that stretches into the progress bar */}
          <Animated.View
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: inset,
              height: D,
              left,
              width,
              borderRadius: D / 2,
              backgroundColor: bg,
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.28), inset 0 -1px 1px rgba(0,0,0,0.08)',
              alignItems: 'center',
              justifyContent: 'center',
            } as any}
          >
            <Animated.Text
              style={{
                color: '#fff',
                fontSize,
                fontWeight: '500',
                fontFamily: fonts.system,
                fontVariant: ['tabular-nums'],
                marginRight: D * 0.5,
                opacity: Animated.multiply(fill.interpolate({ inputRange: [0, 0.7, 1], outputRange: [0, 0, 1] }), done.interpolate({ inputRange: [0, 1], outputRange: [1, 0] })),
              }}
            >
              {pct}%
            </Animated.Text>
          </Animated.View>
          <Animated.View pointerEvents="none" style={{ position: 'absolute', top: inset, left: iconLeft, width: D, height: D, alignItems: 'center', justifyContent: 'center' }}>
            <Animated.View
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                width: D,
                height: D,
                alignItems: 'center',
                justifyContent: 'center',
                opacity: done.interpolate({ inputRange: [0, 0.6], outputRange: [1, 0], extrapolate: 'clamp' }),
                transform: [{ rotate: rot.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '-90deg'] }) }],
              }}
            >
              <ArrowDown size={iconSize} color="#fff" strokeWidth={2.4} style={{ display: 'block' } as any} />
            </Animated.View>
            <Animated.View
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                width: D,
                height: D,
                alignItems: 'center',
                justifyContent: 'center',
                opacity: done,
                transform: [{ scale: done.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] }) }],
              }}
            >
              <Check size={iconSize} color="#fff" strokeWidth={2.6} style={{ display: 'block' } as any} />
            </Animated.View>
          </Animated.View>
        </Animated.View>
      )}
    </Pressable>
  );
}

/** Maps the agent's install status ("Downloading files 3/12", "Installing FFmpeg") to 0–1. */
export function installProgress(detail: string | null | undefined, startedAt: number) {
  const elapsed = (Date.now() - startedAt) / 1000;
  const creep = 0.9 * (1 - Math.exp(-elapsed / 10));
  const files = detail?.match(/(\d+)\/(\d+)/);
  let phase = 0.06;
  if (files) phase = 0.06 + 0.44 * (Number(files[1]) / Number(files[2]));
  else if (/requirement/i.test(detail ?? '')) phase = 0.55;
  else if (/^Installing/i.test(detail ?? '')) phase = 0.6;
  return Math.min(0.95, Math.max(phase, creep));
}

import { useSyncExternalStore } from 'react';
import { Platform, useColorScheme } from 'react-native';

/**
 * Semantic colors, light and dark. Appearance always follows the system setting
 * (HIG dark-mode.md › "Avoid offering an app-specific appearance setting").
 * Contrast (text on its surface): label 16:1, secondary 5.3:1 light / 7.4:1 dark, accentText 4.9:1 / 5.9:1.
 */
const light = {
  window: '#FFFFFF',
  sidebar: '#F2F2F4',
  sidebarSelected: 'rgba(0,0,0,0.075)',
  label: '#1D1D1F',
  secondary: '#6E6E73',
  tertiary: '#AEAEB2',
  separator: 'rgba(0,0,0,0.1)',
  sidebarRule: 'rgba(0,0,0,0.09)',
  fill: '#F2F2F7',
  fillStrong: '#E5E5EA',
  button: '#E8E8ED',
  buttonHover: '#DCDCE1',
  segmentOn: '#FFFFFF',
  card: '#FFFFFF',
  cardBorder: 'rgba(0,0,0,0.08)',
  accent: '#0071E3',
  accentText: '#0066CC',
  onAccent: '#FFFFFF',
  getFill: '#EEEEF2',
  green: '#28A745',
  greenText: '#1E7B34',
  red: '#E5372B',
  redText: '#C4251A',
  orange: '#F59E0B',
  overlay: 'rgba(0,0,0,0.22)',
  mono: '#F6F6F8',
  highlight: 'rgba(0,113,227,0.14)',
  shadow: 'rgba(0,0,0,0.12)',
};

const dark: typeof light = {
  window: '#1E1E1F',
  sidebar: '#29292B',
  sidebarSelected: 'rgba(255,255,255,0.1)',
  label: '#F5F5F7',
  secondary: '#A1A1A6',
  tertiary: '#636366',
  separator: 'rgba(255,255,255,0.12)',
  sidebarRule: 'rgba(255,255,255,0.13)',
  fill: '#2C2C2E',
  fillStrong: '#3A3A3C',
  button: '#3F3F42',
  buttonHover: '#4B4B4F',
  segmentOn: '#5B5B5F',
  card: '#262628',
  cardBorder: 'rgba(255,255,255,0.08)',
  accent: '#0A84FF',
  accentText: '#4DA3FF',
  onAccent: '#FFFFFF',
  getFill: '#3A3A3C',
  green: '#30D158',
  greenText: '#4CD964',
  red: '#FF453A',
  redText: '#FF6961',
  orange: '#FF9F0A',
  overlay: 'rgba(0,0,0,0.38)',
  mono: '#171718',
  highlight: 'rgba(10,132,255,0.22)',
  shadow: 'rgba(0,0,0,0.5)',
};

export type Colors = typeof light;

/**
 * Apple's San Francisco everywhere it's licensed to appear: on a Mac, -apple-system resolves to
 * SF Pro (Text and Display optical sizes) and ui-monospace to SF Mono. SF Pro may not be bundled
 * for Windows or Linux, so there the app ships Inter (open source, drawn to SF's metrics).
 */
export const fonts = {
  system: Platform.select({
    web: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro", "Inter Variable", "Segoe UI Variable Text", "Segoe UI", system-ui, sans-serif',
    default: undefined,
  }),
  display: Platform.select({
    web: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro", "Inter Variable", "Segoe UI Variable Display", "Segoe UI", system-ui, sans-serif',
    default: undefined,
  }),
  mono: Platform.select({ web: 'ui-monospace, "SF Mono", Menlo, "Cascadia Mono", Consolas, monospace', default: 'monospace' }),
};

/**
 * Type scale modelled on the 2019 Mac App Store: heavy 28pt page titles, 20pt bold shelf
 * headings, 13pt body (macOS default), nothing under 11pt (typography.md minimum is 10).
 */
export const type = {
  largeTitle: { fontSize: 28, fontWeight: '700' as const, letterSpacing: -0.6, lineHeight: 34, fontFamily: fonts.display },
  title1: { fontSize: 24, fontWeight: '700' as const, letterSpacing: -0.45, lineHeight: 29, fontFamily: fonts.display },
  title2: { fontSize: 20, fontWeight: '700' as const, letterSpacing: -0.35, lineHeight: 25, fontFamily: fonts.display },
  headline: { fontSize: 13, fontWeight: '600' as const, letterSpacing: -0.08, fontFamily: fonts.system },
  sidebar: { fontSize: 13, fontWeight: '500' as const, letterSpacing: -0.08, fontFamily: fonts.system },
  body: { fontSize: 13, fontWeight: '400' as const, letterSpacing: -0.08, lineHeight: 18, fontFamily: fonts.system },
  callout: { fontSize: 12, fontWeight: '400' as const, lineHeight: 16, fontFamily: fonts.system },
  caption: { fontSize: 11, fontWeight: '400' as const, letterSpacing: 0.06, lineHeight: 14, fontFamily: fonts.system },
  mono: { fontSize: 11.5, lineHeight: 16, fontFamily: fonts.mono },
};

// Follow the system appearance live, including while the window is open.
const mq = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
const subscribe = (cb: () => void) => {
  mq?.addEventListener('change', cb);
  return () => mq?.removeEventListener('change', cb);
};
const useSystemScheme = () => useSyncExternalStore(subscribe, () => (mq ? (mq.matches ? 'dark' : 'light') : null));

export function useTheme() {
  const rn = useColorScheme();
  const scheme = useSystemScheme() ?? rn;
  const c = scheme === 'dark' ? dark : light;
  return { c, dark: scheme === 'dark', type };
}

export const radius = { s: 6, m: 10, l: 14, icon: 0.225 };

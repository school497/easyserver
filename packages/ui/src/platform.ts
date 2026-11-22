import { useEffect, useState } from 'react';
import { AccessibilityInfo, Linking } from 'react-native';
import type { LocalFile } from './backend/types';

/** Opens the system file picker. Folder mode keeps the relative paths, so a whole site uploads in one go. */
export function pickFiles(opts: { directory?: boolean; accept?: string[] } = {}): Promise<LocalFile[]> {
  return new Promise((resolve) => {
    if (typeof document === 'undefined') return resolve([]);
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    if (opts.directory) (input as any).webkitdirectory = true;
    if (opts.accept?.length && !opts.directory) input.accept = opts.accept.join(',');
    input.style.display = 'none';
    document.body.appendChild(input);
    input.onchange = async () => {
      const list = Array.from(input.files ?? []);
      input.remove();
      const files: LocalFile[] = [];
      for (const f of list) {
        let rel = ((f as any).webkitRelativePath as string) || f.name;
        // Drop the picked folder's own name so its contents land at the site root.
        if (opts.directory && rel.includes('/')) rel = rel.split('/').slice(1).join('/');
        if (rel.split('/').some((seg) => seg.startsWith('.'))) continue; // skip .DS_Store, .git, etc.
        files.push({ path: rel, data: new Uint8Array(await f.arrayBuffer()) });
      }
      resolve(files);
    };
    input.addEventListener('cancel', () => (input.remove(), resolve([])));
    input.click();
  });
}

export const openUrl = (url: string) => Linking.openURL(url);

export function useReducedMotion() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled?.().then(setOn).catch(() => {});
    const sub = AccessibilityInfo.addEventListener?.('reduceMotionChanged', setOn);
    return () => sub?.remove?.();
  }, []);
  return on;
}

export const isMacShell = () => typeof navigator !== 'undefined' && /Mac/.test(navigator.platform) && !!(globalThis as any).easyserverShell;

export function formatBytes(n: number | null | undefined) {
  if (n == null) return '—';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  while (n >= 1000 && i < u.length - 1) (n /= 1000), i++;
  return `${n < 10 && i > 0 ? n.toFixed(1) : Math.round(n)} ${u[i]}`;
}

export function formatDuration(sec: number) {
  sec = Math.max(0, Math.floor(sec));
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (d) return `${d}d ${h}h ${m}m`;
  if (h) return `${h}h ${m}m ${s}s`;
  return `${m}m ${s}s`;
}

export function timeAgo(iso: string | null | undefined) {
  if (!iso) return 'never';
  const s = (Date.now() - Date.parse(iso)) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} hr ago`;
  return `${Math.floor(s / 86400)} days ago`;
}

export const platformName = (p: string | null | undefined) =>
  ({ darwin: 'macOS', linux: 'Linux', win32: 'Windows' } as Record<string, string>)[p ?? ''] ?? p ?? 'Unknown';

/** Focus rings only for keyboard users (like :focus-visible), not after a mouse click. */
let keyboardModality = false;
if (typeof window !== 'undefined') {
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Tab' || e.key.startsWith('Arrow')) keyboardModality = true;
  }, true);
  window.addEventListener('mousedown', () => (keyboardModality = false), true);
}
export const showFocusRing = (focused: boolean) => focused && keyboardModality;

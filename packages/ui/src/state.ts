import { useSyncExternalStore } from 'react';
import type { Backend, BackendState } from './backend/types';

export type Tab = 'home' | 'discover' | 'plugins' | 'search' | 'settings';
export type Detail = { kind: 'store'; sourceUrl: string } | { kind: 'plugin'; pluginId: string } | null;

export interface Route {
  tab: Tab;
  detail: Detail;
  /** Search target to scroll to and highlight once the page is shown. */
  target: string | null;
  /** Increments on every navigation so pages can re-run target scrolling. */
  nonce: number;
}

export interface AppState extends BackendState {
  booted: boolean;
  bootError: string | null;
  route: Route;
  addServerOpen: boolean;
  /** In-flight work keyed by plugin id or source url, e.g. "Installing". */
  busy: Record<string, string>;
  toast: { text: string; tone: 'info' | 'error' } | null;
}

function createStore<T extends object>(initial: T) {
  let state = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => state,
    set(patch: Partial<T> | ((s: T) => Partial<T>)) {
      state = { ...state, ...(typeof patch === 'function' ? patch(state) : patch) };
      listeners.forEach((l) => l());
    },
    subscribe(l: () => void) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
  };
}

export const store = createStore<AppState>({
  booted: false,
  bootError: null,
  account: null,
  servers: [],
  selectedId: null,
  status: null,
  uptime: [],
  plugins: [],
  route: { tab: 'home', detail: null, target: null, nonce: 0 },
  addServerOpen: false,
  busy: {},
  toast: null,
});

export function useApp<U>(sel: (s: AppState) => U): U {
  return useSyncExternalStore(store.subscribe, () => sel(store.get()));
}

let backendRef: Backend | null = null;
export const setBackend = (b: Backend) => (backendRef = b);
export const backend = () => {
  if (!backendRef) throw new Error('backend not set');
  return backendRef;
};

export function navigate(tab: Tab, detail: Detail = null, target: string | null = null) {
  store.set((s) => ({ route: { tab, detail, target, nonce: s.route.nonce + 1 } }));
}

export function selectedServer(s: AppState) {
  return s.servers.find((x) => x.id === s.selectedId) ?? null;
}

let toastTimer: any;
export function toast(text: string, tone: 'info' | 'error' = 'info') {
  clearTimeout(toastTimer);
  store.set({ toast: { text, tone } });
  toastTimer = setTimeout(() => store.set({ toast: null }), tone === 'error' ? 6000 : 3500);
}

export function setBusy(key: string, label: string | null) {
  store.set((s) => {
    const busy = { ...s.busy };
    if (label) busy[key] = label;
    else delete busy[key];
    return { busy };
  });
}

/** Run a command with busy tracking and error toasts. */
export async function run<T>(key: string, label: string, fn: () => Promise<T>): Promise<T | undefined> {
  setBusy(key, label);
  try {
    return await fn();
  } catch (e: any) {
    toast(e?.message ?? String(e), 'error');
    return undefined;
  } finally {
    setBusy(key, null);
  }
}

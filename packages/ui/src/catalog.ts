import { useEffect, useSyncExternalStore } from 'react';
import { manifestUrl, parseGithubUrl, rawUrl, rankTrending, validateManifest, type InstallStat, type PluginManifest } from '@easyserver/core';
import { backend } from './state';

/**
 * The plugin store, built live from the GitHub links in Supabase's `plugin_sources` table.
 *
 *   1. On open, the cached catalog renders immediately (localStorage, survives restarts).
 *   2. In the background the list of links is re-read from Supabase and each manifest is
 *      re-fetched from raw.githubusercontent.com in parallel; the view updates when it lands.
 *   3. Realtime on `plugin_sources` triggers the same refresh when you add or remove a link.
 */
export interface CatalogItem {
  sourceUrl: string;
  id: string;
  name: string;
  manifest: PluginManifest;
  iconUrl: string | null;
}

interface CatalogState {
  items: CatalogItem[];
  stats: InstallStat[];
  loading: boolean;
  loadedOnce: boolean;
  errors: { sourceUrl: string; error: string }[];
  fetchedAt: number;
}

const KEY = 'easyserver.catalog.v1';
const STALE_MS = 30_000;

function loadCache(): CatalogState {
  try {
    const c = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (c?.items) return { ...c, loading: false, loadedOnce: c.items.length > 0, errors: [] };
  } catch {}
  return { items: [], stats: [], loading: false, loadedOnce: false, errors: [], fetchedAt: 0 };
}

let state = loadCache();
const listeners = new Set<() => void>();
function set(patch: Partial<CatalogState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
  if (patch.items || patch.stats) {
    try {
      localStorage.setItem(KEY, JSON.stringify({ items: state.items, stats: state.stats, fetchedAt: state.fetchedAt }));
    } catch {}
  }
}

async function fetchOne(sourceUrl: string): Promise<CatalogItem> {
  const loc = parseGithubUrl(sourceUrl);
  const res = await fetch(manifestUrl(loc), { cache: 'no-cache' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const v = validateManifest(await res.json());
  if (!v.ok) throw new Error(v.errors[0]);
  const m = v.manifest;
  return { sourceUrl, id: m.id, name: m.name, manifest: m, iconUrl: rawUrl(loc, m.icon) };
}

let inflight: Promise<void> | null = null;
export function refreshCatalog(force = false): Promise<void> {
  if (inflight) return inflight;
  if (!force && Date.now() - state.fetchedAt < STALE_MS && state.loadedOnce) return Promise.resolve();
  inflight = (async () => {
    set({ loading: true });
    try {
      const b = backend();
      const demo = b.demoCatalog?.();
      if (demo) {
        set({
          items: demo.map((d) => ({ sourceUrl: d.sourceUrl, id: d.manifest.id, name: d.manifest.name, manifest: d.manifest, iconUrl: d.iconUrl })),
          stats: await b.installStats(),
          errors: [],
          fetchedAt: Date.now(),
        });
        return;
      }
      const [urls, stats] = await Promise.all([b.sources(), b.installStats().catch(() => [] as InstallStat[])]);
      const results = await Promise.allSettled(urls.map(fetchOne));
      const items: CatalogItem[] = [];
      const errors: CatalogState['errors'] = [];
      const seen = new Set<string>();
      results.forEach((r, i) => {
        if (r.status === 'fulfilled') {
          if (!seen.has(r.value.id)) items.push(r.value);
          seen.add(r.value.id);
        } else {
          // Keep the last good copy of a manifest if GitHub is briefly unreachable.
          const cached = state.items.find((x) => x.sourceUrl === urls[i]);
          if (cached && !seen.has(cached.id)) items.push(cached), seen.add(cached.id);
          errors.push({ sourceUrl: urls[i], error: String(r.reason?.message ?? r.reason) });
        }
      });
      items.sort((a, b) => a.name.localeCompare(b.name));
      set({ items, stats, errors, fetchedAt: Date.now() });
      if (errors.length) console.warn('Plugin store: some sources failed', errors);
    } catch (e) {
      console.warn('Plugin store refresh failed', e);
    } finally {
      set({ loading: false, loadedOnce: true });
      inflight = null;
    }
  })();
  return inflight;
}

export function clearCatalogCache() {
  try {
    localStorage.removeItem(KEY);
  } catch {}
  state = { items: [], stats: [], loading: false, loadedOnce: false, errors: [], fetchedAt: 0 };
  listeners.forEach((l) => l());
  return refreshCatalog(true);
}

export function useCatalog() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );
}

let sourcesSub: (() => void) | null = null;
/** Call from the Discover screen: renders the cache instantly, then revalidates. */
export function useLiveCatalog() {
  const s = useCatalog();
  useEffect(() => {
    refreshCatalog(true);
    if (!sourcesSub) sourcesSub = backend().onSourcesChanged(() => refreshCatalog(true));
  }, []);
  return s;
}

export const trending = (items: CatalogItem[], stats: InstallStat[]) => rankTrending(items, stats, 10);
export const findCatalogItem = (sourceUrl: string) => state.items.find((i) => i.sourceUrl === sourceUrl) ?? null;
export const catalogState = () => state;

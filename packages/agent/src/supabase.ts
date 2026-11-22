import fs from 'node:fs';
import path from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_KEY, SUPABASE_URL, isConfigured } from '@easyserver/core';
import { ensureDir, homeDir } from './util';

/** Session storage on disk (0600), so the agent stays signed in across restarts. */
function fileStorage(dir: string) {
  ensureDir(dir);
  const file = (key: string) => path.join(dir, key.replace(/[^\w.-]/g, '_') + '.json');
  return {
    getItem: (key: string) => {
      try {
        return fs.readFileSync(file(key), 'utf8');
      } catch {
        return null;
      }
    },
    setItem: (key: string, value: string) => fs.writeFileSync(file(key), value, { mode: 0o600 }),
    removeItem: (key: string) => fs.rmSync(file(key), { force: true }),
  };
}

export async function createAgentClient(): Promise<SupabaseClient> {
  if (!isConfigured()) {
    throw new Error(
      'Supabase is not configured. Set EASYSERVER_SUPABASE_URL and EASYSERVER_SUPABASE_KEY, or rebuild with a .env file.',
    );
  }
  let transport: any;
  if (typeof (globalThis as any).WebSocket === 'undefined') {
    transport = (await import('ws')).default;
  }
  return createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: {
      storage: fileStorage(path.join(homeDir(), 'session')),
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
    realtime: transport ? { transport } : undefined,
  });
}

export async function ensureSignedIn(sb: SupabaseClient): Promise<string> {
  const { data } = await sb.auth.getSession();
  if (data.session?.user) return data.session.user.id;
  const res = await sb.auth.signInAnonymously();
  if (res.error) {
    throw new Error(
      `Could not sign in to Supabase (${res.error.message}). Make sure "Allow anonymous sign-ins" is on in Authentication > Sign In / Providers.`,
    );
  }
  return res.data.user!.id;
}

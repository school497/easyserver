// Values are injected at build time from the repo-root .env (see scripts/env.mjs).
// The agent also accepts EASYSERVER_SUPABASE_URL / EASYSERVER_SUPABASE_KEY at runtime.
declare const __SUPABASE_URL__: string;
declare const __SUPABASE_KEY__: string;

function env(name: string): string | undefined {
  try {
    return typeof process !== 'undefined' ? process.env?.[name] : undefined;
  } catch {
    return undefined;
  }
}

export const SUPABASE_URL: string =
  env('EASYSERVER_SUPABASE_URL') || (typeof __SUPABASE_URL__ !== 'undefined' ? __SUPABASE_URL__ : '');
export const SUPABASE_KEY: string =
  env('EASYSERVER_SUPABASE_KEY') || (typeof __SUPABASE_KEY__ !== 'undefined' ? __SUPABASE_KEY__ : '');
export const APP_VERSION = '1.0.0';
export const MANIFEST_FILE = 'easyserver.plugin.json';
export const isConfigured = () => SUPABASE_URL.startsWith('https://') && SUPABASE_KEY.length > 20;

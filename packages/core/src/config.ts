// Values are injected at build time from the repo-root .env (see scripts/env.mjs).
// The agent also accepts EASYSERVER_SUPABASE_URL / EASYSERVER_SUPABASE_KEY at runtime.
declare const __SUPABASE_URL__: string;
declare const __SUPABASE_KEY__: string;
declare const __APP_VERSION__: string;

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
export const APP_VERSION: string = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.0.0-dev';
export const MANIFEST_FILE = 'easyserver.plugin.json';
/** Plugins from these sources get the verified badge. */
export const OFFICIAL_PLUGIN_SOURCES = ['https://github.com/school497/easyserver-plugins/'];
export const isConfigured = () => SUPABASE_URL.startsWith('https://') && SUPABASE_KEY.length > 20;

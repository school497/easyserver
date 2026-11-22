import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { defines, root } from './env.mjs';

const extensions = ['.web.tsx', '.web.ts', '.web.mjs', '.web.js', '.tsx', '.ts', '.mjs', '.js', '.jsx', '.json'];

// Strict Content-Security-Policy for packaged builds (dev needs Vite's inline HMR preamble).
const CSP =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; " +
  "img-src 'self' data: blob: https://raw.githubusercontent.com https://*.githubusercontent.com; " +
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://raw.githubusercontent.com; font-src 'self' data:";
const csp = () => ({
  name: 'easyserver-csp',
  apply: 'build',
  transformIndexHtml: (html) => html.replace('<head>', `<head>
    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`),
});

export default defineConfig(({ mode }) => ({
  root: process.cwd(),
  base: './',
  plugins: [react(), csp()],
  resolve: {
    alias: {
      'react-native': 'react-native-web',
      '@react-native/assets-registry/registry': `${root}/scripts/shims/assets-registry.js`,
    },
    extensions,
  },
  define: {
    ...defines(),
    __DEV__: JSON.stringify(mode !== 'production'),
    global: 'globalThis',
  },
  optimizeDeps: {
    esbuildOptions: { resolveExtensions: extensions, loader: { '.js': 'jsx' } },
  },
  server: { port: Number(process.env.PORT) || 5173, strictPort: true, fs: { allow: [root] } },
  build: { outDir: 'dist', emptyOutDir: true, chunkSizeWarningLimit: 2000 },
}));

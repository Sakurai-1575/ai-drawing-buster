import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Tauri-friendly defaults: fixed port, relative asset paths, no screen clearing.
// See https://v2.tauri.app/start/frontend/vite/
const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
  plugins: [react()],
  base: './',
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: 'ws', host, port: 1421 } : undefined,
    watch: { ignored: ['**/src-tauri/**'] },
  },
  envPrefix: ['VITE_', 'TAURI_ENV_*'],
  build: {
    target: 'es2021',
    outDir: 'dist',
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
    rollupOptions: {
      output: {
        // The quiz drawings (500 quizzes of stroke data) and React are big and change at different
        // paces, so they get their own chunks, fetched in parallel with the app code.
        // Translations and multiplayer are dynamic imports (see src/data/quizI18n, src/App.tsx).
        manualChunks(id) {
          const path = id.replace(/\\/g, '/');
          if (/\/node_modules\/(react|react-dom|scheduler)\//.test(path)) return 'react';
          if (/\/src\/data\/(quizzes|shapes)\.ts$/.test(path)) return 'quizzes-1';
          if (/\/src\/data\/quizzesVol[23]\.ts$/.test(path)) return 'quizzes-2';
        },
      },
    },
  },
});

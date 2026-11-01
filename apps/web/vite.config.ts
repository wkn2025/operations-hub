/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // API_URL lets the Playwright run point a second dev server at its own throwaway API
  server: { port: 5173, proxy: { '/api': process.env.API_URL ?? 'http://localhost:3001' } },
  // tippy.js (Tiptap bubble menu) resolves to its CJS build under vitest; point it at the ESM build
  test: { environment: 'jsdom', setupFiles: ['./src/test/setup.ts'], css: false, server: { deps: { inline: [/@tiptap\//, /tippy/] } }, alias: { 'tippy.js': 'tippy.js/dist/tippy.esm.js' } },
});

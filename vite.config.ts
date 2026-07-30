/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    // Fully static output — no server runtime of any kind (§1, §34).
    target: 'es2022',
    sourcemap: true,
    // Vocabulary band bundles are intentionally large (up to ~2.8 MB raw, ~120 kB gzipped)
    // and are always lazily imported, so they never affect initial load. The default
    // 500 kB warning would fire on every build for content that is working as designed.
    chunkSizeWarningLimit: 3000,
    // No hand-written `manualChunks`. Splitting vendors by package name produced a
    // circular chunk (vendor -> vendor-react -> vendor) that broke the built app at
    // runtime. Rollup's automatic chunking is correct, and the parts that matter for
    // §29 — route-level splitting and one lazy chunk per frequency band — come from
    // dynamic `import()` rather than from manual grouping.
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['e2e/**', 'node_modules/**'],
  },
});

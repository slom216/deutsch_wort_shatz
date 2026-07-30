import { defineConfig, devices } from '@playwright/test';

// Deliberately not Vite's default 4173: reusing a stray preview server from another
// project on that port would silently test the wrong application.
const PORT = 4319;

/**
 * End-to-end configuration (Phase 0 deliverable 11).
 *
 * Tests run against the real production build served by `vite preview`, which is also
 * how the app ships: a static bundle with no server-side logic.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      // Desktop-first application (§1).
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: `npm run build && npm run preview -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    // Always start our own server. Reusing whatever happens to answer on this port can
    // point the whole suite at a different application.
    reuseExistingServer: false,
    timeout: 180_000,
  },
});

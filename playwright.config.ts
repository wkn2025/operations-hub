import { defineConfig, devices } from '@playwright/test';
import { resolve } from 'node:path';

// First run on a machine: `npx playwright install chromium`. Then `npx playwright test`.
// Starts its own API (port 3101, temp DATA_DIR, dev auth, seeded) and Vite (5174) so a running `npm run dev` is untouched,
// plus a second API (3103) that serves a fresh `apps/web` build itself, so built-app.spec.ts runs under the real CSP.
const API_PORT = 3101, WEB_PORT = 5174, BUILT_PORT = 3103;

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1, // one shared seeded database
  reporter: [['list']],
  use: { baseURL: `http://localhost:${WEB_PORT}`, trace: 'retain-on-failure', viewport: { width: 1440, height: 900 } },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } }],
  webServer: [
    { command: 'node e2e/start-api.mjs', url: `http://localhost:${API_PORT}/api/me`, env: { E2E_API_PORT: String(API_PORT) }, reuseExistingServer: false, timeout: 120_000 },
    { command: `npx vite --port ${WEB_PORT} --strictPort`, cwd: 'apps/web', url: `http://localhost:${WEB_PORT}`, env: { API_URL: `http://localhost:${API_PORT}` }, reuseExistingServer: false, timeout: 120_000 },
    {
      command: 'npm run build -w apps/web && node e2e/start-api.mjs', url: `http://localhost:${BUILT_PORT}/api/me`, reuseExistingServer: false, timeout: 240_000,
      env: { E2E_API_PORT: String(BUILT_PORT), E2E_CONTROL_PORT: '3104', WEB_DIST: resolve(__dirname, 'apps/web/dist') },
    },
  ],
});

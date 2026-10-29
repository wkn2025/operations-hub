import { defineConfig, devices } from '@playwright/test';

// First run on a machine: `npx playwright install chromium`. Then `npx playwright test`.
// Starts its own API (port 3101, temp DATA_DIR, dev auth, seeded) and Vite (5174) so a running `npm run dev` is untouched.
const API_PORT = 3101, WEB_PORT = 5174;

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
  ],
});

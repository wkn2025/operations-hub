// Playwright webServer: a throwaway API on E2E_API_PORT with a freshly seeded DATA_DIR (wiped on every run).
import { mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

const root = resolve(import.meta.dirname, '..');
const server = join(root, 'apps/server');
const tsx = join(root, 'node_modules/tsx/dist/cli.mjs');
const dataDir = join(tmpdir(), 'ops-hub-e2e'); // ponytail: one fixed dir, wiped at start; parallel e2e runs would need unique dirs
rmSync(dataDir, { recursive: true, force: true });
mkdirSync(dataDir, { recursive: true });

const env = { ...process.env, DATA_DIR: dataDir, AUTH_MODE: 'dev', NODE_ENV: 'development', PORT: process.env.E2E_API_PORT ?? '3101', ADMIN_BOOTSTRAP_EMAILS: 'admin@demo.test' };
const seed = spawnSync(process.execPath, [tsx, 'src/seed/run.ts'], { cwd: server, env, stdio: 'inherit' });
if (seed.status !== 0) process.exit(seed.status ?? 1);
const api = spawn(process.execPath, [tsx, 'src/index.ts'], { cwd: server, env, stdio: 'inherit' });
api.on('exit', (code) => process.exit(code ?? 0));
for (const s of ['SIGINT', 'SIGTERM']) process.on(s, () => api.kill());

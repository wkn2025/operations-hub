// Playwright webServer: a throwaway API on E2E_API_PORT with a freshly seeded DATA_DIR (wiped on every run).
// Also a localhost-only control endpoint (POST http://127.0.0.1:E2E_CONTROL_PORT/restart) that kills the API process and
// starts a new one on the same DATA_DIR without reseeding, so acceptance tests can prove data survives a server restart.
import { mkdirSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

const root = resolve(import.meta.dirname, '..');
const server = join(root, 'apps/server');
const tsx = join(root, 'node_modules/tsx/dist/cli.mjs');
const dataDir = join(tmpdir(), 'ops-hub-e2e'); // ponytail: one fixed dir, wiped at start; parallel e2e runs would need unique dirs
rmSync(dataDir, { recursive: true, force: true });
mkdirSync(dataDir, { recursive: true });

const port = process.env.E2E_API_PORT ?? '3101';
const env = { ...process.env, DATA_DIR: dataDir, AUTH_MODE: 'dev', NODE_ENV: 'development', PORT: port, ADMIN_BOOTSTRAP_EMAILS: 'admin@demo.test' };
const seed = spawnSync(process.execPath, [tsx, 'src/seed/run.ts'], { cwd: server, env, stdio: 'inherit' });
if (seed.status !== 0) process.exit(seed.status ?? 1);

let api, restarting = false;
const start = () => {
  api = spawn(process.execPath, [tsx, 'src/index.ts'], { cwd: server, env, stdio: 'inherit' });
  api.on('exit', (code) => { if (!restarting) process.exit(code ?? 0); });
};
start();

const up = async () => {
  for (let i = 0; i < 300; i++) {
    try { if ((await fetch(`http://localhost:${port}/api/me`)).ok) return; } catch { /* not listening yet */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('API did not come back after restart');
};

const control = createServer(async (req, res) => {
  if (req.method !== 'POST' || req.url !== '/restart') return res.writeHead(404).end();
  try {
    restarting = true;
    const gone = new Promise((r) => api.once('exit', r));
    api.kill(); // hard stop (TerminateProcess on Windows): committed SQLite data must survive it
    await gone;
    restarting = false;
    start();
    await up();
    res.writeHead(200).end('restarted');
  } catch (e) {
    res.writeHead(500).end(String(e));
  }
});
control.listen(Number(process.env.E2E_CONTROL_PORT ?? 3102), '127.0.0.1');

for (const s of ['SIGINT', 'SIGTERM']) process.on(s, () => { restarting = true; api.kill(); control.close(); process.exit(0); });

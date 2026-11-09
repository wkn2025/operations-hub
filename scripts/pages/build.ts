// `npm run build:pages`: the read-only GitHub Pages demo in apps/web/dist-pages — the web app built in static-demo mode
// (hash routes, relative asset paths, API answered from a snapshot) plus the snapshot of the seeded content.
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const outDir = join(root, 'apps/web/dist-pages');
const vite = join(root, 'node_modules/vite/bin/vite.js');
const r = spawnSync(process.execPath, [vite, 'build', '--base', './', '--outDir', outDir, '--emptyOutDir'], {
  cwd: join(root, 'apps/web'), stdio: 'inherit', env: { ...process.env, VITE_STATIC_DEMO: '1' },
});
if (r.status !== 0) process.exit(r.status ?? 1);
process.argv[2] = outDir;
await import('./snapshot');
writeFileSync(join(outDir, '.nojekyll'), '');

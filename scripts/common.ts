// Shared by `npm run backup` / `npm run export` (run from the repo root).
import Database from 'better-sqlite3';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

export const root = resolve(import.meta.dirname, '..');
/** Same resolution as the server: a relative DATA_DIR is relative to apps/server (where the server runs). */
export const dataDir = resolve(root, 'apps/server', process.env.DATA_DIR ?? './data');

/** Read-only connection to the live database; safe while the server is running (WAL). */
export function openDb() {
  const file = join(dataDir, 'app.db');
  if (!existsSync(file)) {
    console.error(`No database at ${file}. Set DATA_DIR or run the server/seed first.`);
    process.exit(1);
  }
  return new Database(file, { readonly: true, fileMustExist: true });
}

import type BetterSqlite3 from 'better-sqlite3';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { zip, type ZipEntry } from './zip';

/** Filesystem-safe UTC timestamp, e.g. 2026-10-29T13-05-00-123Z. */
export const stamp = () => new Date().toISOString().replace(/[:.]/g, '-');

/** Counts rows of every ordinary table (FTS shadow tables included) - used to prove a backup copy is complete. */
export function rowCounts(db: BetterSqlite3.Database): Record<string, number> {
  const names = (db.prepare("select name from sqlite_master where type = 'table' and name not like 'sqlite_%' order by name").all() as { name: string }[]).map((t) => t.name);
  return Object.fromEntries(names.map((t) => [t, (db.prepare(`select count(*) n from "${t.replace(/"/g, '""')}"`).get() as { n: number }).n]));
}

/**
 * Hot backup: SQLite online backup API (safe while the server is writing) -> <outRoot>/<ts>/app.db,
 * plus <DATA_DIR>/uploads/* -> <outRoot>/<ts>/uploads.zip.
 * The two are captured moments apart (DB first, then files): an upload during the backup lands in the zip without a DB row
 * (harmless orphan); a file deleted in between is skipped and listed in `missing` (its row then points at nothing).
 * ponytail: uploads are zipped in memory (15 MB cap per file); stream if the upload folder grows past a few hundred MB.
 */
export async function backup(sqlite: BetterSqlite3.Database, dataDir: string, outRoot: string) {
  const dir = resolve(outRoot, stamp());
  mkdirSync(dir, { recursive: true });
  const dbPath = join(dir, 'app.db');
  await sqlite.backup(dbPath);
  const up = resolve(dataDir, 'uploads');
  const names = existsSync(up) ? readdirSync(up, { withFileTypes: true }).filter((d) => d.isFile()).map((d) => d.name).sort() : [];
  const { entries, missing } = readUploads(up, names);
  const zipPath = join(dir, 'uploads.zip');
  writeFileSync(zipPath, zip(entries));
  return { dir, dbPath, zipPath, files: entries.length, missing, counts: rowCounts(sqlite) };
}

/** Reads upload files for the zip; files that vanish between listing and reading are skipped and reported, not fatal. */
export function readUploads(up: string, names: string[]) {
  const entries: ZipEntry[] = [], missing: string[] = [];
  for (const n of names) {
    try { entries.push({ name: `uploads/${n}`, data: readFileSync(join(up, n)) }); } catch { missing.push(n); }
  }
  return { entries, missing };
}

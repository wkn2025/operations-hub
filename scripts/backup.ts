// npm run backup  ->  backups/<timestamp>/{app.db, uploads.zip}   (BACKUP_DIR overrides the target folder)
import { resolve } from 'node:path';
import { backup } from '../apps/server/src/services/backup';
import { dataDir, openDb, root } from './common';

const db = openDb();
const r = await backup(db, dataDir, resolve(root, process.env.BACKUP_DIR ?? 'backups'));
db.close();
console.log(`Backup written to ${r.dir}`);
console.log(`  app.db       ${Object.entries(r.counts).filter(([t]) => !t.includes('_fts')).map(([t, n]) => `${t}=${n}`).join(' ')}`);
console.log(`  uploads.zip  ${r.files} file(s)`);
if (r.missing.length) console.warn(`  WARNING: ${r.missing.length} upload(s) vanished during the backup and were skipped: ${r.missing.join(', ')}`);

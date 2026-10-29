// npm run export  ->  exports/<timestamp>/{index.json, articles/<slug>.{json,md}, flows/<slug>.json, files/*}   (EXPORT_DIR overrides)
import { existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { writeExport } from '../apps/server/src/services/export';
import { dataDir, openDb, root } from './common';

const db = openDb();
const dir = writeExport(db, dataDir, resolve(root, process.env.EXPORT_DIR ?? 'exports'));
db.close();
console.log(`Export written to ${dir} (${existsSync(join(dir, 'articles')) ? readdirSync(join(dir, 'articles')).length / 2 : 0} articles)`);

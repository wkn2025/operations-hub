import { buildApp } from '../app';
import { loadConfig } from '../config';
import { seedBase } from './base';

// `npm run seed`: uses the same DATA_DIR/.env as the server; safe to run repeatedly.
const app = await buildApp({ config: loadConfig() });
await seedBase(app);
const n = (app.sqlite.prepare("select count(*) n from articles where status = 'published'").get() as { n: number }).n;
console.log(`Seed complete: ${n} published articles in ${app.config.dataDir}`);
await app.close();

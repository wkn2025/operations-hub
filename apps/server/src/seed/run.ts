import { buildApp } from '../app';
import { loadConfig } from '../config';
import { seedAllowed, seedBase } from './base';

// `npm run seed`: same DATA_DIR/.env as the server; safe to run repeatedly. NODE_ENV defaults to development here.
const env = { ...process.env, NODE_ENV: process.env.NODE_ENV || 'development' };
try { seedAllowed(env, process.argv.slice(2)); } catch (e) { console.error((e as Error).message); process.exit(1); }
const app = await buildApp({ config: loadConfig(env) });
await seedBase(app);
const n = (app.sqlite.prepare("select count(*) n from articles where status = 'published'").get() as { n: number }).n;
console.log(`Seed complete: ${n} published articles in ${app.config.dataDir}`);
await app.close();

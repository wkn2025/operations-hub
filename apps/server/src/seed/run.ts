import { buildApp } from '../app';
import { loadConfig } from '../config';
import { seedAllowed, seedBase, seedCategories } from './base';

// `npm run seed`: same DATA_DIR/.env as the server; safe to run repeatedly. NODE_ENV defaults to development here.
// `npm run seed -- --categories-only`: just the eight top-level categories; allowed in production.
const env = { ...process.env, NODE_ENV: process.env.NODE_ENV || 'development' };
const argv = process.argv.slice(2);
try { seedAllowed(env, argv); } catch (e) { console.error((e as Error).message); process.exit(1); }
const app = await buildApp({ config: loadConfig(env) });
if (argv.includes('--categories-only')) {
  seedCategories(app);
  console.log(`Categories ready: ${(app.sqlite.prepare('select count(*) n from categories where parent_id is null').get() as { n: number }).n} top-level in ${app.config.dataDir}`);
  await app.close();
  process.exit(0);
}
await seedBase(app);
const n = (app.sqlite.prepare("select count(*) n from articles where status = 'published'").get() as { n: number }).n;
console.log(`Seed complete: ${n} published articles and ${(app.sqlite.prepare("select count(*) n from flows where status = 'published'").get() as { n: number }).n} flows in ${app.config.dataDir}`);
await app.close();

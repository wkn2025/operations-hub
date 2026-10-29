import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import { join } from 'node:path';
import type { User } from '@ops/shared';
import { loadConfig, type Config } from './config';
import { createDb, type Db } from './db/client';
import { buildOidcProvider, type OidcClient } from './auth/oidc';
import { devProvider } from './auth/dev';
import { createSessionApi, loadUser } from './auth/session';
import { authRoutes } from './routes/auth';

declare module 'fastify' {
  interface FastifyInstance { db: Db; sqlite: import('better-sqlite3').Database; config: Config }
  interface FastifyRequest { user: User | null }
}

export interface BuildOpts {
  dbPath?: string; // default: <DATA_DIR>/app.db; ':memory:' for tests
  env?: Record<string, string | undefined>;
  config?: Config; // pre-loaded config (index.ts); wins over env
  oidcClient?: OidcClient; // test seam
}

export async function buildApp(opts: BuildOpts = {}): Promise<FastifyInstance> {
  const config = opts.config ?? loadConfig(opts.env ?? process.env); // throws on unsafe config before anything starts
  const app = Fastify({ logger: config.nodeEnv === 'test' ? false : { level: 'info' } });

  const { db, sqlite } = createDb(opts.dbPath ?? join(config.dataDir, 'app.db'));
  app.decorate('db', db);
  app.decorate('sqlite', sqlite);
  app.decorate('config', config);
  app.addHook('onClose', async () => { sqlite.close(); });

  await app.register(cookie, { secret: config.sessionSecret });
  app.decorateRequest('user', null);
  app.addHook('onRequest', loadUser(app));

  const provider = config.authMode === 'oidc' ? buildOidcProvider(config.oidc!, opts.oidcClient) : devProvider;
  authRoutes(app, provider, createSessionApi(app));

  return app;
}

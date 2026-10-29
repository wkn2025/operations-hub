import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app';
import { editorAllowlist } from '../src/db/schema';

export const env = {
  AUTH_MODE: 'dev', NODE_ENV: 'test',
  SESSION_SECRET: 'test-secret-test-secret-test-secret', ADMIN_BOOTSTRAP_EMAILS: 'boss@x.test',
};

export interface Ctx {
  app: FastifyInstance;
  admin: string; editor: string; editor2: string; viewer: string; // cookies
  req: (cookie: string | undefined, method: string, url: string, payload?: unknown) => Promise<{ status: number; body: any }>;
}

export async function setup(): Promise<Ctx> {
  const app = await buildApp({ dbPath: ':memory:', env });
  const now = new Date().toISOString();
  for (const e of ['ed@x.test', 'ed2@x.test']) app.db.insert(editorAllowlist).values({ email: e, addedBy: null, createdAt: now }).run();
  const login = async (email: string) => {
    const r = await app.inject({ method: 'POST', url: '/api/auth/dev/login', payload: { email } });
    return ([r.headers['set-cookie']].flat()[0] as string).split(';')[0];
  };
  const req: Ctx['req'] = async (cookie, method, url, payload) => {
    const r = await app.inject({ method: method as any, url, payload: payload as any, headers: cookie ? { cookie } : {} });
    let body: any = null;
    try { body = r.json(); } catch { /* empty */ }
    return { status: r.statusCode, body };
  };
  return {
    app, req,
    admin: await login('boss@x.test'), editor: await login('ed@x.test'),
    editor2: await login('ed2@x.test'), viewer: await login('v@x.test'),
  };
}

/** Same writer shape the Task 3 admin API will use: settings values are JSON. */
export const setSetting = (app: FastifyInstance, key: string, value: unknown) =>
  app.sqlite.prepare('insert into settings(key,value) values(?,?) on conflict(key) do update set value=excluded.value').run(key, JSON.stringify(value));

export const doc =(...paras: string[]) => ({
  type: 'doc', content: paras.map((t) => ({ type: 'paragraph', content: [{ type: 'text', text: t }] })),
});

import { describe, it, expect, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app';
import { editorAllowlist } from '../src/db/schema';
import { requireRole } from '../src/auth/policy';
import { emailFromClaims, type OidcClient } from '../src/auth/oidc';

const env = {
  AUTH_MODE: 'dev', NODE_ENV: 'test',
  SESSION_SECRET: 'test-secret-test-secret-test-secret', ADMIN_BOOTSTRAP_EMAILS: 'boss@x.test',
};
const oenv = {
  ...env, AUTH_MODE: 'oidc', OIDC_ISSUER: 'https://i', OIDC_CLIENT_ID: 'c',
  OIDC_CLIENT_SECRET: 's', OIDC_REDIRECT_URI: 'http://l/api/auth/callback',
};

async function login(app: FastifyInstance, email: string) {
  const res = await app.inject({ method: 'POST', url: '/api/auth/dev/login', payload: { email } });
  const raw = [res.headers['set-cookie']].flat()[0] as string;
  return { res, raw, cookie: raw.split(';')[0] };
}
const me = async (app: FastifyInstance, cookie?: string) =>
  (await app.inject({ method: 'GET', url: '/api/me', headers: cookie ? { cookie } : {} })).json();
const allow = (app: FastifyInstance, email: string) =>
  app.db.insert(editorAllowlist).values({ email, addedBy: null, createdAt: new Date().toISOString() }).run();

describe('dev auth', () => {
  let app: FastifyInstance;
  beforeEach(async () => { app = await buildApp({ dbPath: ':memory:', env }); });

  it('login sets signed httpOnly cookie and /api/me returns role', async () => {
    const { res, raw, cookie } = await login(app, 'someone@x.test');
    expect(res.statusCode).toBe(200);
    expect(raw).toMatch(/HttpOnly/i);
    expect(raw).toMatch(/SameSite=Lax/i);
    expect(decodeURIComponent(cookie)).toMatch(/\.[A-Za-z0-9+/_-]{20,}/); // signature suffix
    const body = await me(app, cookie);
    expect(body.user.role).toBe('viewer');
    expect(body.authMode).toBe('dev');
  });
  it('unknown email viewer; allowlisted editor; bootstrap admin', async () => {
    allow(app, 'ed@x.test');
    expect((await me(app, (await login(app, 'rando@x.test')).cookie)).user.role).toBe('viewer');
    expect((await me(app, (await login(app, 'ED@x.test')).cookie)).user.role).toBe('editor');
    expect((await me(app, (await login(app, 'boss@x.test')).cookie)).user.role).toBe('admin');
  });
  it('allowlisting after first login promotes on next login', async () => {
    expect((await me(app, (await login(app, 'late@x.test')).cookie)).user.role).toBe('viewer');
    allow(app, 'late@x.test');
    expect((await me(app, (await login(app, 'late@x.test')).cookie)).user.role).toBe('editor');
  });
  it('tampered or missing cookie is anonymous', async () => {
    const { cookie } = await login(app, 'a@x.test');
    expect((await me(app, cookie.slice(0, -3) + 'xxx')).user).toBeNull();
    expect((await me(app)).user).toBeNull();
  });
  it('server-side expiry: expired signed value is anonymous, valid one works', async () => {
    const { cookie } = await login(app, 'exp@x.test');
    const id = app.db.$client.prepare('select id from users where email = ?').get('exp@x.test') as { id: string };
    const mk = (ms: number) => `sid=${encodeURIComponent(app.signCookie(`${id.id}.${ms}`))}`;
    expect((await me(app, mk(Date.now() - 1000))).user).toBeNull();
    expect((await me(app, mk(Date.now() + 60_000))).user.email).toBe('exp@x.test');
    expect((await me(app, `sid=${encodeURIComponent(app.signCookie(id.id))}`)).user).toBeNull(); // legacy/no-expiry value
    expect(cookie).toMatch(/^sid=/);
  });
  it('logout clears the session', async () => {
    const { cookie } = await login(app, 'a@x.test');
    const out = await app.inject({ method: 'POST', url: '/api/auth/logout', headers: { cookie } });
    expect(out.statusCode).toBe(200);
    expect(String([out.headers['set-cookie']].flat()[0])).toMatch(/sid=;/);
  });
  it('requireRole rejects 401 anonymous / 403 wrong role', async () => {
    app.get('/t', { preHandler: requireRole('admin') }, async () => ({ ok: true }));
    expect((await app.inject({ url: '/t' })).statusCode).toBe(401);
    expect((await app.inject({ url: '/t', headers: { cookie: (await login(app, 'v@x.test')).cookie } })).statusCode).toBe(403);
    expect((await app.inject({ url: '/t', headers: { cookie: (await login(app, 'boss@x.test')).cookie } })).statusCode).toBe(200);
  });
  it('dev login route absent in oidc mode', async () => {
    const o = await buildApp({ dbPath: ':memory:', env: oenv, oidcClient: fakeOidc() });
    expect((await o.inject({ method: 'POST', url: '/api/auth/dev/login', payload: { email: 'a@x.test' } })).statusCode).toBe(404);
  });
});

function fakeOidc(email = 'sso@x.test'): OidcClient {
  return {
    authorizationUrl: async (p) => new URL(`https://idp.example/authorize?state=${p.state}&nonce=${p.nonce}`),
    exchange: async (_url, checks) => {
      if (!checks.state) throw new Error('missing state');
      return { email, name: 'SSO User' };
    },
  };
}

describe('oidc provider (mocked client)', () => {
  it('login redirects to IdP and sets a signed tx cookie', async () => {
    const app = await buildApp({ dbPath: ':memory:', env: oenv, oidcClient: fakeOidc() });
    const r = await app.inject({ url: '/api/auth/login' });
    expect(r.statusCode).toBe(302);
    expect(r.headers.location).toMatch(/^https:\/\/idp\.example\/authorize/);
    expect(String([r.headers['set-cookie']].flat()[0])).toMatch(/oidc_tx=/);
  });
  it('callback with mismatched state is rejected, no session', async () => {
    const app = await buildApp({ dbPath: ':memory:', env: oenv, oidcClient: fakeOidc() });
    const r = await app.inject({ url: '/api/auth/login' });
    const tx = [r.headers['set-cookie']].flat()[0]!.split(';')[0];
    const cb = await app.inject({ url: '/api/auth/callback?code=1&state=WRONG', headers: { cookie: tx } });
    expect(cb.statusCode).toBe(400);
    expect(cb.headers['set-cookie']).toBeUndefined();
  });
  it('callback without tx cookie rejected', async () => {
    const app = await buildApp({ dbPath: ':memory:', env: oenv, oidcClient: fakeOidc() });
    expect((await app.inject({ url: '/api/auth/callback?code=1&state=S' })).statusCode).toBe(400);
  });
  it('happy path creates session via same provider interface', async () => {
    const app = await buildApp({ dbPath: ':memory:', env: oenv, oidcClient: fakeOidc('boss@x.test') });
    const r = await app.inject({ url: '/api/auth/login' });
    const tx = [r.headers['set-cookie']].flat()[0]!.split(';')[0];
    const state = new URL(r.headers.location as string).searchParams.get('state');
    const cb = await app.inject({ url: `/api/auth/callback?code=1&state=${state}`, headers: { cookie: tx } });
    expect(cb.statusCode).toBe(302);
    const sid = (cb.headers['set-cookie'] as string[]).find((c) => c.startsWith('sid='))!.split(';')[0];
    expect((await me(app, sid)).user.role).toBe('admin');
  });
});

describe('emailFromClaims', () => {
  it('prefers email, rejects unverified, requires @ in fallbacks', () => {
    expect(emailFromClaims({ email: 'a@x.test', preferred_username: 'b@x.test', name: 'A' })).toEqual({ email: 'a@x.test', name: 'A' });
    expect(emailFromClaims({ email: 'a@x.test', email_verified: true }).email).toBe('a@x.test');
    expect(() => emailFromClaims({ email: 'a@x.test', email_verified: false })).toThrow(/verified/);
    expect(emailFromClaims({ preferred_username: 'p@x.test' }).email).toBe('p@x.test');
    expect(() => emailFromClaims({ preferred_username: 'just-a-name' })).toThrow();
    expect(() => emailFromClaims({ upn: 'nope' })).toThrow();
  });
});

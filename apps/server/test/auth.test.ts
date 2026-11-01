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
  it('dev user list absent in oidc mode', async () => {
    const o = await buildApp({ dbPath: ':memory:', env: oenv, oidcClient: fakeOidc() });
    expect((await o.inject({ method: 'GET', url: '/api/auth/dev/users' })).statusCode).toBe(404);
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
  it('callback with mismatched state is rejected with a friendly redirect, no session, next kept', async () => {
    const app = await buildApp({ dbPath: ':memory:', env: oenv, oidcClient: fakeOidc() });
    const r = await app.inject({ url: '/api/auth/login?next=%2Fadmin%2Fusers' });
    const tx = [r.headers['set-cookie']].flat()[0]!.split(';')[0];
    const cb = await app.inject({ url: '/api/auth/callback?code=1&state=WRONG', headers: { cookie: tx } });
    expect(cb.statusCode).toBe(302);
    expect(cb.headers.location).toBe('/login?error=state_mismatch&next=%2Fadmin%2Fusers');
    expect(([cb.headers['set-cookie']].flat().filter(Boolean) as string[]).some((c) => c.startsWith('sid='))).toBe(false);
  });
  it('callback without (or with a garbled) tx cookie redirects to /login with an error, never 500', async () => {
    const app = await buildApp({ dbPath: ':memory:', env: oenv, oidcClient: fakeOidc() });
    const none = await app.inject({ url: '/api/auth/callback?code=1&state=S' });
    expect(none.statusCode).toBe(302);
    expect(none.headers.location).toBe('/login?error=missing_transaction');
    const garbled = app.signCookie('not json{');
    const bad = await app.inject({ url: '/api/auth/callback?code=1&state=S', headers: { cookie: `oidc_tx=${encodeURIComponent(garbled)}` } });
    expect(bad.statusCode).toBe(302);
    expect(bad.headers.location).toBe('/login?error=missing_transaction');
  });
  it('failed token exchange redirects to /login?error=login_failed', async () => {
    const app = await buildApp({ dbPath: ':memory:', env: oenv, oidcClient: { ...fakeOidc(), exchange: async () => { throw new Error('boom'); } } });
    const r = await app.inject({ url: '/api/auth/login' });
    const tx = [r.headers['set-cookie']].flat()[0]!.split(';')[0];
    const state = new URL(r.headers.location as string).searchParams.get('state');
    const cb = await app.inject({ url: `/api/auth/callback?code=1&state=${state}`, headers: { cookie: tx } });
    expect(cb.headers.location).toBe('/login?error=login_failed');
  });
  it('after login redirects to a same-origin next path only', async () => {
    const app = await buildApp({ dbPath: ':memory:', env: oenv, oidcClient: fakeOidc('n@x.test') });
    const go = async (next: string) => {
      const r = await app.inject({ url: `/api/auth/login?next=${encodeURIComponent(next)}` });
      const tx = [r.headers['set-cookie']].flat()[0]!.split(';')[0];
      const state = new URL(r.headers.location as string).searchParams.get('state');
      return (await app.inject({ url: `/api/auth/callback?code=1&state=${state}`, headers: { cookie: tx } })).headers.location;
    };
    expect(await go('/category/edi')).toBe('/category/edi');
    expect(await go('//evil.example')).toBe('/');
    expect(await go('/\\evil.example')).toBe('/');
    expect(await go('https://evil.example')).toBe('/');
    // browsers strip tab/CR/LF from Location, turning '/<TAB>/evil' into '//evil'
    for (const c of ['\t', '\n', '\r', '\u0000', '\u007f']) expect(await go(`/${c}/evil.example`)).toBe('/');
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
  it('with a tenant pin, rejects a token from another (or no) tenant', () => {
    expect(emailFromClaims({ email: 'a@x.test', tid: 'T1' }, 'T1').email).toBe('a@x.test');
    expect(() => emailFromClaims({ email: 'a@x.test', tid: 'T2' }, 'T1')).toThrow(/tenant/);
    expect(() => emailFromClaims({ email: 'a@x.test' }, 'T1')).toThrow(/tenant/);
    expect(emailFromClaims({ email: 'a@x.test', tid: 'T2' }).email).toBe('a@x.test'); // no pin: unchanged
  });
});

describe('oidc deactivated user', () => {
  it('callback redirects to /login?error=deactivated (not 401/500) and sets no session for a deactivated user', async () => {
    const app = await buildApp({ dbPath: ':memory:', env: oenv, oidcClient: fakeOidc('gone@x.test') });
    const flow = async () => {
      const r = await app.inject({ url: '/api/auth/login' });
      const tx = [r.headers['set-cookie']].flat()[0]!.split(';')[0];
      const state = new URL(r.headers.location as string).searchParams.get('state');
      return app.inject({ url: `/api/auth/callback?code=1&state=${state}`, headers: { cookie: tx } });
    };
    expect((await flow()).statusCode).toBe(302);
    app.sqlite.prepare("update users set active = 0 where email='gone@x.test'").run();
    const cb = await flow();
    expect(cb.statusCode).toBe(302);
    expect(cb.headers.location).toBe('/login?error=deactivated');
    expect(([cb.headers['set-cookie']].flat().filter(Boolean) as string[]).some((c) => c.startsWith('sid='))).toBe(false);
  });
});

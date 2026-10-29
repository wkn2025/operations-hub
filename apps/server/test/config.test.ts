import { describe, it, expect } from 'vitest';
import { loadConfig } from '../src/config';

describe('loadConfig', () => {
  it('refuses dev auth in production', () => {
    expect(() => loadConfig({ AUTH_MODE: 'dev', NODE_ENV: 'production' })).toThrow(/dev/i);
  });
  it('defaults to dev auth, port 3000, parses bootstrap admins', () => {
    const c = loadConfig({ NODE_ENV: 'development', ADMIN_BOOTSTRAP_EMAILS: 'A@x.test, b@x.test' });
    expect(c.authMode).toBe('dev');
    expect(c.port).toBe(3000);
    expect(c.adminBootstrapEmails).toEqual(['a@x.test', 'b@x.test']);
  });
  it('oidc in production requires oidc vars and a strong secret', () => {
    expect(() => loadConfig({ AUTH_MODE: 'oidc', NODE_ENV: 'production' })).toThrow();
    const c = loadConfig({
      AUTH_MODE: 'oidc', NODE_ENV: 'production', SESSION_SECRET: 'x'.repeat(40),
      OIDC_ISSUER: 'https://login.example/tenant/v2.0', OIDC_CLIENT_ID: 'id',
      OIDC_CLIENT_SECRET: 's', OIDC_REDIRECT_URI: 'https://hub.example/api/auth/callback',
    });
    expect(c.oidc?.clientId).toBe('id');
  });
  it('rejects unknown AUTH_MODE', () => {
    expect(() => loadConfig({ AUTH_MODE: 'nope' })).toThrow();
  });
  it('dev auth fails closed unless NODE_ENV is development/test', () => {
    expect(() => loadConfig({})).toThrow(/NODE_ENV/);
    expect(() => loadConfig({ NODE_ENV: 'staging' })).toThrow(/NODE_ENV/);
    expect(() => loadConfig({ NODE_ENV: 'test' })).not.toThrow();
  });
  describe('oidc session secret', () => {
    const base = {
      AUTH_MODE: 'oidc', NODE_ENV: 'production', OIDC_ISSUER: 'https://i.example', OIDC_CLIENT_ID: 'c',
      OIDC_CLIENT_SECRET: 's', OIDC_REDIRECT_URI: 'https://h.example/api/auth/callback',
    };
    it('rejects missing, short, placeholder and built-in dev secrets', () => {
      expect(() => loadConfig(base)).toThrow(/SESSION_SECRET/);
      expect(() => loadConfig({ ...base, SESSION_SECRET: 'short' })).toThrow(/SESSION_SECRET/);
      expect(() => loadConfig({ ...base, SESSION_SECRET: 'change-me-to-a-long-random-string-32+' })).toThrow(/SESSION_SECRET/);
      expect(() => loadConfig({ ...base, SESSION_SECRET: 'dev-only-insecure-secret-do-not-use-in-prod' })).toThrow(/SESSION_SECRET/);
      expect(() => loadConfig({ ...base, SESSION_SECRET: 'r'.repeat(40) })).not.toThrow();
    });
  });
  it('validates PORT', () => {
    for (const PORT of ['abc', '0', '-1', '1.5', '70000']) expect(() => loadConfig({ NODE_ENV: 'test', PORT })).toThrow(/PORT/);
    expect(loadConfig({ NODE_ENV: 'test', PORT: '8080' }).port).toBe(8080);
  });
});

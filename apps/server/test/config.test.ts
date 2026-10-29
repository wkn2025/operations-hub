import { describe, it, expect } from 'vitest';
import { loadConfig } from '../src/config';

describe('loadConfig', () => {
  it('refuses dev auth in production', () => {
    expect(() => loadConfig({ AUTH_MODE: 'dev', NODE_ENV: 'production' })).toThrow(/dev/i);
  });
  it('defaults to dev auth, port 3000, parses bootstrap admins', () => {
    const c = loadConfig({ ADMIN_BOOTSTRAP_EMAILS: 'A@x.test, b@x.test' });
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
});

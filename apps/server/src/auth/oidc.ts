import * as oc from 'openid-client';
import { safeNextPath } from '@ops/shared';
import type { Config } from '../config';
import { ApiError } from '../services/articles';
import { secureCookies, type SessionProvider } from './session';

export interface OidcChecks { state: string; nonce: string; codeVerifier: string }
/** What the tx cookie carries: the checks plus where to land after login. */
type Tx = OidcChecks & { next?: string };
/** Thin seam over openid-client so the provider is unit-testable without an IdP. */
export interface OidcClient {
  authorizationUrl(p: OidcChecks): Promise<URL>;
  exchange(callbackUrl: URL, checks: OidcChecks): Promise<{ email: string; name?: string }>;
}

/** Real client (Entra ID / any OIDC issuer). Unverified without a tenant: IT item. */
export function createOidcClient(cfg: NonNullable<Config['oidc']>): OidcClient {
  let discovered: Promise<oc.Configuration> | undefined;
  const conf = () => (discovered ??= oc.discovery(new URL(cfg.issuer), cfg.clientId, cfg.clientSecret));
  return {
    async authorizationUrl(p) {
      return oc.buildAuthorizationUrl(await conf(), {
        redirect_uri: cfg.redirectUri, scope: 'openid profile email',
        state: p.state, nonce: p.nonce,
        code_challenge: await oc.calculatePKCECodeChallenge(p.codeVerifier), code_challenge_method: 'S256',
      });
    },
    async exchange(callbackUrl, c) {
      const tokens = await oc.authorizationCodeGrant(await conf(), callbackUrl, {
        pkceCodeVerifier: c.codeVerifier, expectedState: c.state, expectedNonce: c.nonce,
      });
      const claims = tokens.claims();
      return emailFromClaims(claims ?? {}, cfg.tenantId);
    },
  };
}

/**
 * Pick the identity email from ID-token claims.
 * ponytail/IT item: users are keyed by email for now (Ruling). Entra emails/UPNs can be renamed or reused;
 * keying by the immutable `oid` (+ `tid`) is the upgrade path once IT confirms it. Unverified or non-email
 * values are rejected so a spoofable claim can't grant a role. With `tenantId` (OIDC_TENANT_ID) set, a token
 * from any other tenant (e.g. a multi-tenant/common issuer) is rejected.
 */
export function emailFromClaims(claims: Record<string, unknown>, tenantId?: string): { email: string; name?: string } {
  if (tenantId && claims.tid !== tenantId) throw new Error('IdP token is from another tenant');
  if (claims.email_verified === false) throw new Error('IdP email is not verified');
  const email = [claims.email, claims.preferred_username, claims.upn].find((v) => typeof v === 'string' && v.includes('@'));
  if (!email) throw new Error('IdP returned no usable email claim');
  return { email: email as string, name: typeof claims.name === 'string' ? claims.name : undefined };
}

const TX_COOKIE = 'oidc_tx';

export function buildOidcProvider(cfg: NonNullable<Config['oidc']>, client: OidcClient = createOidcClient(cfg)): SessionProvider {
  return {
    mode: 'oidc',
    registerRoutes(app, session) {
      app.get('/api/auth/login', async (req, reply) => {
        const tx: Tx = {
          state: oc.randomState(), nonce: oc.randomNonce(), codeVerifier: oc.randomPKCECodeVerifier(),
          next: safeNextPath((req.query as Record<string, unknown>).next),
        };
        reply.setCookie(TX_COOKIE, JSON.stringify(tx), {
          signed: true, httpOnly: true, sameSite: 'lax', path: '/api/auth', maxAge: 600,
          secure: secureCookies(app.config),
        });
        return reply.redirect((await client.authorizationUrl(tx)).toString());
      });

      app.get('/api/auth/callback', async (req, reply) => {
        const raw = req.cookies[TX_COOKIE];
        const un = raw ? req.unsignCookie(raw) : null;
        const tx = un?.valid && un.value ? parseTx(un.value) : null;
        // every failure lands on the login page with a reason (never a bare JSON error or a 500)
        const fail = (error: string) => {
          reply.clearCookie(TX_COOKIE, { path: '/api/auth' });
          return reply.redirect(`/login?${new URLSearchParams({ error, ...(tx?.next && tx.next !== '/' ? { next: tx.next } : {}) })}`);
        };
        if (!tx) return fail('missing_transaction');
        const callbackUrl = new URL(cfg.redirectUri);
        callbackUrl.search = new URL(req.url, 'http://x').search;
        if (callbackUrl.searchParams.get('state') !== tx.state) return fail('state_mismatch');
        let identity;
        try {
          identity = await client.exchange(callbackUrl, tx);
        } catch (err) {
          req.log.warn({ err }, 'oidc exchange failed');
          return fail('login_failed');
        }
        reply.clearCookie(TX_COOKIE, { path: '/api/auth' });
        try {
          session.login(reply, identity);
        } catch (err) {
          if (err instanceof ApiError && err.status === 403) return fail('deactivated');
          throw err;
        }
        return reply.redirect(tx.next ?? '/');
      });
    },
  };
}


function parseTx(raw: string): Tx | null {
  try {
    const t = JSON.parse(raw) as Partial<Tx> | null;
    if (!t || typeof t.state !== 'string' || typeof t.nonce !== 'string' || typeof t.codeVerifier !== 'string') return null;
    return { state: t.state, nonce: t.nonce, codeVerifier: t.codeVerifier, next: safeNextPath(t.next) };
  } catch { return null; }
}

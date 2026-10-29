import * as oc from 'openid-client';
import type { Config } from '../config';
import type { SessionProvider } from './session';

export interface OidcChecks { state: string; nonce: string; codeVerifier: string }
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
      const email = String(claims?.email ?? claims?.preferred_username ?? claims?.upn ?? '');
      if (!email.includes('@')) throw new Error('IdP returned no email claim');
      return { email, name: claims?.name as string | undefined };
    },
  };
}

const TX_COOKIE = 'oidc_tx';

export function buildOidcProvider(cfg: NonNullable<Config['oidc']>, client: OidcClient = createOidcClient(cfg)): SessionProvider {
  return {
    mode: 'oidc',
    registerRoutes(app, session) {
      app.get('/api/auth/login', async (_req, reply) => {
        const tx: OidcChecks = {
          state: oc.randomState(), nonce: oc.randomNonce(), codeVerifier: oc.randomPKCECodeVerifier(),
        };
        reply.setCookie(TX_COOKIE, JSON.stringify(tx), {
          signed: true, httpOnly: true, sameSite: 'lax', path: '/api/auth', maxAge: 600,
          secure: app.config.nodeEnv === 'production',
        });
        return reply.redirect((await client.authorizationUrl(tx)).toString());
      });

      app.get('/api/auth/callback', async (req, reply) => {
        const raw = req.cookies[TX_COOKIE];
        const un = raw ? req.unsignCookie(raw) : null;
        if (!un?.valid || !un.value) return reply.code(400).send({ error: 'missing login transaction' });
        const tx = JSON.parse(un.value) as OidcChecks;
        const callbackUrl = new URL(cfg.redirectUri);
        callbackUrl.search = new URL(req.url, 'http://x').search;
        if (callbackUrl.searchParams.get('state') !== tx.state) return reply.code(400).send({ error: 'state mismatch' });
        try {
          const identity = await client.exchange(callbackUrl, tx);
          reply.clearCookie(TX_COOKIE, { path: '/api/auth' });
          session.login(reply, identity);
          return reply.redirect('/');
        } catch (err) {
          req.log.warn({ err }, 'oidc exchange failed');
          return reply.code(401).send({ error: 'login failed' });
        }
      });
    },
  };
}

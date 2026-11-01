import { z } from 'zod';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export interface Config {
  port: number;
  dataDir: string;
  authMode: 'dev' | 'oidc';
  nodeEnv: string;
  sessionSecret: string;
  adminBootstrapEmails: string[];
  oidc?: { issuer: string; clientId: string; clientSecret: string; redirectUri: string; tenantId?: string };
  /** built web app (apps/web/dist) served by this process; undefined = API only (dev uses Vite) */
  webDist?: string;
}

const DEFAULT_WEB_DIST = fileURLToPath(new URL('../../web/dist', import.meta.url));

const DEV_SECRET = 'dev-only-insecure-secret-do-not-use-in-prod';

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const authMode = z.enum(['dev', 'oidc']).parse(env.AUTH_MODE ?? 'dev');
  const nodeEnv = env.NODE_ENV ?? 'development';
    // Fail closed: dev auth only when NODE_ENV is explicitly development/test (unset counts as unsafe).
  if (authMode === 'dev' && !['development', 'test'].includes(env.NODE_ENV ?? ''))
    throw new Error("AUTH_MODE=dev is refused unless NODE_ENV is 'development' or 'test'");

  const sessionSecret = env.SESSION_SECRET ?? (authMode === 'dev' ? DEV_SECRET : '');
  if (authMode !== 'dev' && (sessionSecret.length < 32 || sessionSecret === DEV_SECRET || sessionSecret.startsWith('change-me')))
    throw new Error('SESSION_SECRET must be a real random value of at least 32 chars');

  const port = Number(env.PORT ?? 3000);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) throw new Error(`Invalid PORT: ${env.PORT}`);

  let oidc: Config['oidc'];
  if (authMode === 'oidc') {
    const o = z
      .object({ OIDC_ISSUER: z.string().url(), OIDC_CLIENT_ID: z.string().min(1), OIDC_CLIENT_SECRET: z.string().min(1), OIDC_REDIRECT_URI: z.string().url(), OIDC_TENANT_ID: z.string().min(1).optional() })
      .parse(env);
    oidc = { issuer: o.OIDC_ISSUER, clientId: o.OIDC_CLIENT_ID, clientSecret: o.OIDC_CLIENT_SECRET, redirectUri: o.OIDC_REDIRECT_URI, tenantId: o.OIDC_TENANT_ID };
  }

  return {
    port,
    dataDir: env.DATA_DIR ?? './data',
    authMode, nodeEnv, sessionSecret, oidc,
    // WEB_DIST wins; in production the repo's apps/web/dist is used when it has been built
    webDist: env.WEB_DIST || (nodeEnv === 'production' && existsSync(DEFAULT_WEB_DIST + '/index.html') ? DEFAULT_WEB_DIST : undefined),
    adminBootstrapEmails: (env.ADMIN_BOOTSTRAP_EMAILS ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean),
  };
}

import { z } from 'zod';

export interface Config {
  port: number;
  dataDir: string;
  authMode: 'dev' | 'oidc';
  nodeEnv: string;
  sessionSecret: string;
  adminBootstrapEmails: string[];
  oidc?: { issuer: string; clientId: string; clientSecret: string; redirectUri: string };
}

const DEV_SECRET = 'dev-only-insecure-secret-do-not-use-in-prod';

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const authMode = z.enum(['dev', 'oidc']).parse(env.AUTH_MODE ?? 'dev');
  const nodeEnv = env.NODE_ENV ?? 'development';
  const prod = nodeEnv === 'production';
  if (authMode === 'dev' && prod) throw new Error('AUTH_MODE=dev is refused when NODE_ENV=production');

  const sessionSecret = env.SESSION_SECRET ?? (prod ? '' : DEV_SECRET);
  if (prod && sessionSecret.length < 32) throw new Error('SESSION_SECRET (>=32 chars) is required in production');

  let oidc: Config['oidc'];
  if (authMode === 'oidc') {
    const o = z
      .object({ OIDC_ISSUER: z.string().url(), OIDC_CLIENT_ID: z.string().min(1), OIDC_CLIENT_SECRET: z.string().min(1), OIDC_REDIRECT_URI: z.string().url() })
      .parse(env);
    oidc = { issuer: o.OIDC_ISSUER, clientId: o.OIDC_CLIENT_ID, clientSecret: o.OIDC_CLIENT_SECRET, redirectUri: o.OIDC_REDIRECT_URI };
  }

  return {
    port: Number(env.PORT ?? 3000),
    dataDir: env.DATA_DIR ?? './data',
    authMode, nodeEnv, sessionSecret, oidc,
    adminBootstrapEmails: (env.ADMIN_BOOTSTRAP_EMAILS ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean),
  };
}

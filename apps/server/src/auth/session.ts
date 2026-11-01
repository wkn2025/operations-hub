import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { eq } from 'drizzle-orm';
import type { Role, User } from '@ops/shared';
import type { Db } from '../db/client';
import { editorAllowlist, users } from '../db/schema';
import { ApiError } from '../services/articles';

export const SESSION_COOKIE = 'sid';
const SESSION_MAX_AGE_S = 12 * 60 * 60;

/** Secure (HTTPS-only) cookies whenever real auth or production is in play; only the http://localhost dev demo goes without. */
export const secureCookies = (c: { nodeEnv: string; authMode: string }) => c.nodeEnv === 'production' || c.authMode === 'oidc';

/** Shared by dev and OIDC: they only differ in how they obtain a verified email. */
export interface SessionApi {
  /** Find-or-create the user for a verified identity and start a session. */
  login(reply: FastifyReply, identity: { email: string; name?: string }): User;
  logout(reply: FastifyReply): void;
}

export interface SessionProvider {
  readonly mode: 'dev' | 'oidc';
  registerRoutes(app: FastifyInstance, session: SessionApi): void;
}

/** bootstrap env -> admin; allowlist -> editor; everyone else -> viewer. */
export function resolveRole(db: Db, adminEmails: string[], email: string): Role {
  email = email.toLowerCase();
  if (adminEmails.includes(email)) return 'admin';
  const allowed = db.select().from(editorAllowlist).where(eq(editorAllowlist.email, email)).get();
  return allowed ? 'editor' : 'viewer';
}

export function createSessionApi(app: FastifyInstance): SessionApi {
  return {
    login(reply, { email, name }) {
      email = email.toLowerCase();
      const now = new Date().toISOString();
      const resolved = resolveRole(app.db, app.config.adminBootstrapEmails, email);
      const existing = app.db.select().from(users).where(eq(users.email, email)).get();
      if (existing && !existing.active) throw new ApiError(403, { error: 'deactivated' });
      // Bootstrap admins always admin; otherwise an explicit admin-set role wins; otherwise allowlist/viewer (so removal demotes).
      const role = app.config.adminBootstrapEmails.includes(email) ? 'admin' : existing?.roleSetByAdmin ? existing.role : resolved;
      let user: User;
      if (existing) {
        app.db.update(users).set({ role, lastLoginAt: now }).where(eq(users.id, existing.id)).run();
        user = { id: existing.id, email, name: existing.name, role };
      } else {
        user = { id: crypto.randomUUID(), email, name: name ?? email.split('@')[0], role };
        app.db.insert(users).values({ ...user, createdAt: now, lastLoginAt: now }).run();
      }
      const expires = Date.now() + SESSION_MAX_AGE_S * 1000; // server-side expiry, independent of browser maxAge
      reply.setCookie(SESSION_COOKIE, `${user.id}.${expires}`, {
        signed: true, httpOnly: true, sameSite: 'lax', path: '/',
        secure: secureCookies(app.config), maxAge: SESSION_MAX_AGE_S,
      });
      return user;
    },
    logout(reply) {
      reply.clearCookie(SESSION_COOKIE, { path: '/' });
    },
  };
}

/** onRequest hook: signed cookie -> req.user (null if absent/tampered/unknown). */
export function loadUser(app: FastifyInstance) {
  return async (req: FastifyRequest) => {
    req.user = null;
    const raw = req.cookies[SESSION_COOKIE];
    if (!raw) return;
    const { valid, value } = req.unsignCookie(raw);
    if (!valid || !value) return;
    const dot = value.lastIndexOf('.');
    if (dot < 0 || !(Number(value.slice(dot + 1)) > Date.now())) return; // expired or malformed
    const row = app.db.select().from(users).where(eq(users.id, value.slice(0, dot))).get();
    if (row?.active) req.user = { id: row.id, email: row.email, name: row.name, role: row.role };
  };
}

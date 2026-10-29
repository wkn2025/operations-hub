import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { eq } from 'drizzle-orm';
import { ROLES, type Role, type User } from '@ops/shared';
import type { Db } from '../db/client';
import { editorAllowlist, users } from '../db/schema';

export const SESSION_COOKIE = 'sid';
const SESSION_MAX_AGE_S = 8 * 60 * 60;

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

const rank = (r: Role) => ROLES.length - ROLES.indexOf(r); // admin 3 > editor 2 > viewer 1

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
      // Never demote on login (admin actions own demotion); do promote via allowlist/bootstrap.
      const role = existing && rank(existing.role) > rank(resolved) ? existing.role : resolved;
      let user: User;
      if (existing) {
        app.db.update(users).set({ role, lastLoginAt: now }).where(eq(users.id, existing.id)).run();
        user = { id: existing.id, email, name: existing.name, role };
      } else {
        user = { id: crypto.randomUUID(), email, name: name ?? email.split('@')[0], role };
        app.db.insert(users).values({ ...user, createdAt: now, lastLoginAt: now }).run();
      }
      reply.setCookie(SESSION_COOKIE, user.id, {
        signed: true, httpOnly: true, sameSite: 'lax', path: '/',
        secure: app.config.nodeEnv === 'production', maxAge: SESSION_MAX_AGE_S,
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
    const row = app.db.select().from(users).where(eq(users.id, value)).get();
    if (row) req.user = { id: row.id, email: row.email, name: row.name, role: row.role };
  };
}

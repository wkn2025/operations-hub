import type { FastifyInstance } from 'fastify';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { roleSchema } from '@ops/shared';
import { requireRole } from '../auth/policy';
import { resolveRole } from '../auth/session';
import { users } from '../db/schema';
import { ApiError, notFound, parse } from '../services/articles';
import { audit } from '../services/audit';

const patchBody = z.object({ role: roleSchema.nullable(), active: z.boolean() }).partial().strict()
  .refine((b) => b.role !== undefined || b.active !== undefined, 'role or active required');

export function userRoutes(app: FastifyInstance) {
  const admin = requireRole('admin');
  const bootstrap = (email: string) => app.config.adminBootstrapEmails.includes(email);

  app.get('/api/admin/users', { preHandler: admin }, async () => ({
    users: app.db.select().from(users).all().sort((a, b) => a.email.localeCompare(b.email))
      .map((u) => ({ ...u, bootstrap: bootstrap(u.email) })),
  }));

  app.patch<{ Params: { id: string } }>('/api/admin/users/:id', { preHandler: admin }, async (req) => {
    const b = parse(patchBody, req.body);
    // better-sqlite3 transactions are deferred, but the process is single-threaded and synchronous, so check+write is atomic.
    // ponytail: multi-process deployment would need `.immediate()`.
    app.sqlite.transaction(() => {
      const cur = app.db.select().from(users).where(eq(users.id, req.params.id)).get();
      if (!cur) throw notFound();
      // role:null = clear the admin pin and re-resolve (bootstrap/allowlist/viewer); guards use the RESOLVED role.
      const role = b.role === null ? resolveRole(app.db, app.config.adminBootstrapEmails, cur.email) : b.role ?? cur.role, active = b.active ?? cur.active;
      const losesAdmin = cur.active && cur.role === 'admin' && (role !== 'admin' || !active);
      if (losesAdmin && bootstrap(cur.email))
        throw new ApiError(409, { error: 'bootstrap_admin', message: 'bootstrap admins (ADMIN_BOOTSTRAP_EMAILS) cannot be demoted or deactivated via the API' });
      if (losesAdmin && app.db.select().from(users).where(and(eq(users.role, 'admin'), eq(users.active, true))).all().length <= 1)
        throw new ApiError(409, { error: 'last_admin', message: 'cannot demote or deactivate the last active admin' });
      app.db.update(users).set({ role, active, ...(b.role !== undefined && { roleSetByAdmin: b.role !== null }) }).where(eq(users.id, cur.id)).run();
      audit(app.db, { actorId: req.user!.id, action: 'user.update', entity: 'user', entityId: cur.id,
        summary: `${cur.email}: role ${cur.role} -> ${role}, active ${cur.active} -> ${active}` +
          (b.role === undefined ? '' : b.role === null ? '; roleSetByAdmin cleared' : '; roleSetByAdmin set') });
    })();
    return { user: app.db.select().from(users).where(eq(users.id, req.params.id)).get() };
  });
}

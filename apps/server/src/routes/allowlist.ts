import type { FastifyInstance } from 'fastify';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { emailSchema } from '@ops/shared';
import { requireRole } from '../auth/policy';
import { resolveRole } from '../auth/session';
import { editorAllowlist, users } from '../db/schema';
import { ApiError, notFound, parse } from '../services/articles';
import { audit } from '../services/audit';

export function allowlistRoutes(app: FastifyInstance) {
  const admin = requireRole('admin');

  app.get('/api/admin/allowlist', { preHandler: admin }, async () => ({
    entries: app.db.select().from(editorAllowlist).all().sort((a, b) => a.email.localeCompare(b.email)),
  }));

  app.post('/api/admin/allowlist', { preHandler: admin }, async (req, reply) => {
    const { email } = parse(z.object({ email: emailSchema }), req.body);
    app.sqlite.transaction(() => {
      if (app.db.select().from(editorAllowlist).where(eq(editorAllowlist.email, email)).get()) throw new ApiError(409, { error: 'exists' });
      app.db.insert(editorAllowlist).values({ email, addedBy: req.user!.id, createdAt: new Date().toISOString() }).run();
      // Promote an existing, non-overridden user now (viewer only: never touches admins).
      app.db.update(users).set({ role: 'editor' }).where(and(eq(users.email, email), eq(users.roleSetByAdmin, false), eq(users.role, 'viewer'))).run();
      audit(app.db, { actorId: req.user!.id, action: 'allowlist.add', entity: 'allowlist', entityId: email, summary: `Added ${email} to editor allowlist` });
    })();
    return reply.code(201).send({ email });
  });

  app.delete<{ Params: { email: string } }>('/api/admin/allowlist/:email', { preHandler: admin }, async (req) => {
    const email = req.params.email.toLowerCase();
    app.sqlite.transaction(() => {
      if (!app.db.delete(editorAllowlist).where(eq(editorAllowlist.email, email)).run().changes) throw notFound();
      // Demote immediately (next request) unless an admin set this user's role explicitly.
      const u = app.db.select().from(users).where(eq(users.email, email)).get();
      if (u && !u.roleSetByAdmin) app.db.update(users).set({ role: resolveRole(app.db, app.config.adminBootstrapEmails, email) }).where(eq(users.id, u.id)).run();
      audit(app.db, { actorId: req.user!.id, action: 'allowlist.remove', entity: 'allowlist', entityId: email, summary: `Removed ${email} from editor allowlist` });
    })();
    return { ok: true };
  });
}

import type { FastifyInstance } from 'fastify';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { emailSchema } from '@ops/shared';
import { requireRole } from '../auth/policy';
import { resolveRole } from '../auth/session';
import { editorAllowlist, users } from '../db/schema';
import { ApiError, notFound, parse } from '../services/articles';
import { audit } from '../services/audit';

// Transactions are deferred but the process is single-threaded/synchronous, so each is atomic (single process assumed).
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
      const promoted = app.db.update(users).set({ role: 'editor' }).where(and(eq(users.email, email), eq(users.roleSetByAdmin, false), eq(users.role, 'viewer'))).returning({ email: users.email }).all();
      audit(app.db, { actorId: req.user!.id, action: 'allowlist.add', entity: 'allowlist', entityId: email,
        summary: `Added ${email} to editor allowlist; promoted ${promoted.length} user(s)${promoted.length ? ': ' + promoted.map((u) => u.email).join(', ') : ''}` });
    })();
    return reply.code(201).send({ email });
  });

  app.delete<{ Params: { email: string } }>('/api/admin/allowlist/:email', { preHandler: admin }, async (req) => {
    const email = parse(emailSchema, req.params.email);
    app.sqlite.transaction(() => {
      if (!app.db.delete(editorAllowlist).where(eq(editorAllowlist.email, email)).run().changes) throw notFound();
      // Demote immediately (next request) unless an admin set this user's role explicitly.
      const u = app.db.select().from(users).where(eq(users.email, email)).get();
      const next = u && !u.roleSetByAdmin ? resolveRole(app.db, app.config.adminBootstrapEmails, email) : null;
      const demoted = u && next && next !== u.role;
      if (demoted) app.db.update(users).set({ role: next! }).where(eq(users.id, u.id)).run();
      audit(app.db, { actorId: req.user!.id, action: 'allowlist.remove', entity: 'allowlist', entityId: email,
        summary: `Removed ${email} from editor allowlist; demoted ${demoted ? 1 : 0} user(s)${demoted ? `: ${email} ${u.role} -> ${next}` : ''}` });
    })();
    return { ok: true };
  });
}

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireRole } from '../auth/policy';
import { parse, requireApproval } from '../services/articles';
import { audit } from '../services/audit';

const patchBody = z.object({ requireApproval: z.boolean() }).partial().strict()
  .refine((b) => b.requireApproval !== undefined, 'no settings supplied');

export function settingsRoutes(app: FastifyInstance) {
  const get = () => ({ requireApproval: requireApproval(app.sqlite) });
  app.get('/api/admin/settings', { preHandler: requireRole('admin') }, async () => get());
  app.patch('/api/admin/settings', { preHandler: requireRole('admin') }, async (req) => {
    const b = parse(patchBody, req.body);
    app.sqlite.transaction(() => {
      // JSON-encoded, same format as the reader in services/articles.ts and test helper setSetting.
      app.sqlite.prepare('insert into settings(key,value) values(?,?) on conflict(key) do update set value=excluded.value')
        .run('requireApproval', JSON.stringify(b.requireApproval));
      audit(app.db, { actorId: req.user!.id, action: 'settings.update', entity: 'settings', entityId: 'requireApproval', summary: `requireApproval = ${b.requireApproval}` });
    })();
    return get();
  });
}

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireRole } from '../auth/policy';
import { parse } from '../services/articles';

export function auditRoutes(app: FastifyInstance) {
  app.get('/api/admin/audit', { preHandler: requireRole('admin') }, async (req) => {
    const q = parse(z.object({ limit: z.coerce.number().int().min(1).max(200).default(50), cursor: z.coerce.number().int().positive().optional() }), req.query);
    const rows = app.sqlite.prepare(
      `select id, actor_id as actorId, action, entity, entity_id as entityId, detail, created_at as createdAt
       from audit_log where (? is null or id < ?) order by id desc limit ?`).all(q.cursor ?? null, q.cursor ?? null, q.limit + 1) as any[];
    const page = rows.slice(0, q.limit);
    return {
      entries: page.map((r) => ({ ...r, detail: r.detail ? JSON.parse(r.detail) : null })),
      nextCursor: rows.length > q.limit ? String(page[page.length - 1].id) : null,
    };
  });
}

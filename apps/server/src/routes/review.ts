import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireRole } from '../auth/policy';
import { parse } from '../services/articles';

export function reviewRoutes(app: FastifyInstance) {
  app.get('/api/admin/review-due', { preHandler: requireRole('admin', 'editor') }, async (req) => {
    const { days } = parse(z.object({ days: z.coerce.number().int().min(0).max(3650).default(30) }), req.query);
    // All dates are UTC calendar days (reviewDate is a plain YYYY-MM-DD, compared lexically); only published articles need re-review.
    const today = new Date().toISOString().slice(0, 10);
    const cutoff = new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
    const rows = app.sqlite.prepare(
      `select id, slug, title, status, review_date as reviewDate, owner_id as ownerId from articles
       where review_date is not null and review_date <= ? and status = 'published' order by review_date, title`).all(cutoff) as { reviewDate: string }[];
    return { articles: rows.map((r) => ({ ...r, overdue: r.reviewDate < today })) };
  });
}

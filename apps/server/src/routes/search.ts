import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { User } from '@ops/shared';
import { requireRole } from '../auth/policy';
import { parse } from '../services/articles';
import { searchAll } from '../services/search';

const query = z.object({ q: z.string().default(''), limit: z.coerce.number().int().min(1).max(50).default(20) });

export function searchRoutes(app: FastifyInstance) {
  app.get('/api/search', { preHandler: requireRole('admin', 'editor', 'viewer') }, async (req) => {
    const { q, limit } = parse(query, req.query);
    return { groups: searchAll(app, req.user as User, q, limit) };
  });
}

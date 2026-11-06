import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireRole } from '../auth/policy';
import { ApiError, parse } from '../services/articles';
import { lookupCodes, MAX_CODES, splitCodes } from '../services/codes';

const query = z.object({ q: z.string().max(2000).default('') });

export function codeRoutes(app: FastifyInstance) {
  app.get('/api/codes', { preHandler: requireRole('admin', 'editor', 'viewer') }, async (req) => {
    const { q } = parse(query, req.query);
    if (splitCodes(q).length > MAX_CODES) throw new ApiError(400, { error: 'too_many_codes', max: MAX_CODES });
    return { results: lookupCodes(q) };
  });
}

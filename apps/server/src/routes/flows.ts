import type { FastifyInstance } from 'fastify';
import { flowCreateBody, flowPatchBody, type User } from '@ops/shared';
import { requireRole } from '../auth/policy';
import { notFound, parse } from '../services/articles';
import { createFlow, flowView, listFlows, readableFlow, transitionFlow, updateFlow, type FlowTransition } from '../services/flows';

export function flowRoutes(app: FastifyInstance) {
  const reader = requireRole('admin', 'editor', 'viewer');
  const writer = requireRole('admin', 'editor');
  const U = (req: { user: User | null }) => req.user as User; // guaranteed by preHandler
  const show = (req: { user: User | null }, key: string) => {
    const row = readableFlow(app, U(req), key);
    if (!row) throw notFound();
    return flowView(app, row, U(req));
  };

  app.get('/api/flows', { preHandler: reader }, async (req) => ({ flows: listFlows(app, U(req)) }));
  app.get<{ Params: { key: string } }>('/api/flows/:key', { preHandler: reader }, async (req) => show(req, req.params.key));
  app.post('/api/flows', { preHandler: writer }, async (req, reply) => {
    const id = createFlow(app, U(req), parse(flowCreateBody, req.body));
    return reply.code(201).send(show(req, id));
  });
  app.patch<{ Params: { key: string } }>('/api/flows/:key', { preHandler: writer }, async (req) => {
    return show(req, updateFlow(app, U(req), req.params.key, parse(flowPatchBody, req.body)));
  });
  for (const action of ['submit', 'publish', 'archive', 'restore'] as FlowTransition[]) {
    app.post<{ Params: { key: string } }>(`/api/flows/:key/${action}`, { preHandler: writer }, async (req) =>
      show(req, transitionFlow(app, U(req), req.params.key, action)));
  }
}

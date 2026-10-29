import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { articleCreateBody, articlePatchBody, type User } from '@ops/shared';
import { requireRole } from '../auth/policy';
import { revisions } from '../db/schema';
import {
  backlinks, createArticle, listArticles, notFound, parse, readable, restoreRevision, revisionsOf, transition, updateArticle, view, type Transition,
} from '../services/articles';

const listQuery = z.object({
  status: z.string().optional(), categoryId: z.string().optional(), type: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50), offset: z.coerce.number().int().min(0).default(0),
});

export function articleRoutes(app: FastifyInstance) {
  const reader = requireRole('admin', 'editor', 'viewer');
  const writer = requireRole('admin', 'editor');
  const U = (req: { user: User | null }) => req.user as User; // guaranteed by preHandler
  const show = (req: { user: User | null }, id: string) => {
    const a = readable(app, U(req), id);
    if (!a) throw notFound();
    return view(app, a, U(req));
  };

  app.get('/api/articles', { preHandler: reader }, async (req) => ({ articles: listArticles(app, U(req), parse(listQuery, req.query)) }));
  app.post('/api/articles', { preHandler: writer }, async (req, reply) => {
    const id = createArticle(app, U(req), parse(articleCreateBody, req.body));
    return reply.code(201).send(show(req, id));
  });
  // Accepts an id or a slug (the web app routes by slug); visibility is still decided by show().
  const idOf = (k: string) => (app.sqlite.prepare('select id from articles where id = ? or slug = ? order by id = ? desc limit 1').get(k, k, k) as { id: string } | undefined)?.id ?? k;
  app.get<{ Params: { id: string } }>('/api/articles/:id', { preHandler: reader }, async (req) => show(req, idOf(req.params.id)));
  app.patch<{ Params: { id: string } }>('/api/articles/:id', { preHandler: writer }, async (req) =>
    show(req, updateArticle(app, U(req), req.params.id, parse(articlePatchBody, req.body))));

  for (const action of ['submit', 'publish', 'archive', 'restore', 'reject'] as Transition[]) {
    app.post<{ Params: { id: string } }>(`/api/articles/:id/${action}`, { preHandler: writer }, async (req) =>
      show(req, transition(app, U(req), req.params.id, action)));
  }

  app.get<{ Params: { id: string } }>('/api/articles/:id/revisions', { preHandler: reader }, async (req) => ({ revisions: revisionsOf(app, U(req), req.params.id) }));
  app.get<{ Params: { id: string; rev: string } }>('/api/articles/:id/revisions/:rev', { preHandler: reader }, async (req) => {
    revisionsOf(app, U(req), req.params.id); // permission + existence
    const r = app.db.select().from(revisions).where(and(eq(revisions.articleId, req.params.id), eq(revisions.rev, Number(req.params.rev)))).get();
    if (!r) throw notFound();
    return { ...r, content: JSON.parse(r.content), fields: JSON.parse(r.fields) };
  });
  app.post<{ Params: { id: string; rev: string } }>('/api/articles/:id/revisions/:rev/restore', { preHandler: writer }, async (req) =>
    show(req, restoreRevision(app, U(req), req.params.id, Number(req.params.rev))));

  // Editor helpers (Task 6): tag autocomplete and owner picker.
  app.get('/api/tags', { preHandler: writer }, async () => ({
    tags: (app.sqlite.prepare('select distinct t.name from tags t join article_tags x on x.tag_id = t.id order by t.name').all() as { name: string }[]).map((t) => t.name),
  }));
  app.get('/api/owners', { preHandler: writer }, async () => ({
    owners: app.sqlite.prepare("select id, name, email from users where active = 1 and role in ('editor','admin') order by name").all(),
  }));

  app.get<{ Params: { id: string } }>('/api/articles/:id/backlinks', { preHandler: reader }, async (req) => ({ backlinks: backlinks(app, U(req), req.params.id) }));
}

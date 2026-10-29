import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { categoryCreateBody, categoryPatchBody, type User } from '@ops/shared';
import { requireRole } from '../auth/policy';
import { categories } from '../db/schema';
import { ApiError, allCategories, categoryPath, hiddenCategoryIds, notFound, parse, uniqueSlug } from '../services/articles';
import { audit } from '../services/audit';
import { indexArticle } from '../services/search';

export function categoryRoutes(app: FastifyInstance) {
  const admin = requireRole('admin'); // category structure is an admin function
  const find = (id: string) => app.db.select().from(categories).where(eq(categories.id, id)).get();
  /** The FTS "category" column holds the path: reindex every article in the subtree of `id`. */
  const reindexSubtree = (id: string) => {
    const after = allCategories(app), ids = new Set([id]);
    for (let grew = true; grew;) {
      grew = false;
      for (const c of after) if (c.parentId && ids.has(c.parentId) && !ids.has(c.id)) { ids.add(c.id); grew = true; }
    }
    for (const a of app.sqlite.prepare('select id, category_id from articles').all() as { id: string; category_id: string | null }[]) {
      if (a.category_id && ids.has(a.category_id)) indexArticle(app.sqlite, a.id);
    }
  };
  const withPath = () => { const all = allCategories(app); return (c: (typeof all)[number]) => ({ ...c, path: categoryPath(all, c.id) }); };

  app.get('/api/categories', { preHandler: requireRole('admin', 'editor', 'viewer') }, async (req) => {
    const all = allCategories(app), hidden = new Set(hiddenCategoryIds(all, req.user as User));
    const p = withPath();
    return { categories: all.filter((c) => !hidden.has(c.id)).sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)).map(p) };
  });

  app.post('/api/categories', { preHandler: admin }, async (req, reply) => {
    const b = parse(categoryCreateBody, req.body);
    const parent = b.parentId ? find(b.parentId) : undefined;
    if (b.parentId && !parent) throw new ApiError(400, { error: 'invalid', message: 'unknown parentId' });
    if (parent?.archived) throw new ApiError(409, { error: 'parent_archived', message: 'parent category is archived' });
    const id = crypto.randomUUID();
    app.sqlite.transaction(() => {
      app.db.insert(categories).values({
        id, name: b.name, slug: uniqueSlug(app.sqlite, 'categories', b.name), parentId: b.parentId ?? null,
        description: b.description ?? null, sortOrder: b.sortOrder ?? 0, createdAt: new Date().toISOString(),
      }).run();
      audit(app.db, { actorId: req.user!.id, action: 'category.create', entity: 'category', entityId: id, summary: `Created category "${b.name}"` });
    })();
    return reply.code(201).send(withPath()(find(id)!));
  });

  app.patch<{ Params: { id: string } }>('/api/categories/:id', { preHandler: admin }, async (req) => {
    const cur = find(req.params.id);
    if (!cur) throw notFound();
    const b = parse(categoryPatchBody, req.body);
    const all = allCategories(app);
    if (b.parentId !== undefined && b.parentId !== null) {
      if (!find(b.parentId)) throw new ApiError(400, { error: 'invalid', message: 'unknown parentId' });
      const byId = new Map(all.map((c) => [c.id, c]));
      for (let x = byId.get(b.parentId), n = 0; x && n < 100; x = x.parentId ? byId.get(x.parentId) : undefined, n++) {
        if (x.id === cur.id) throw new ApiError(400, { error: 'invalid', message: 'category cannot be its own descendant' });
      }
    }
    const parentId = b.parentId === undefined ? cur.parentId : b.parentId;
    if ((b.parentId !== undefined || b.archived !== undefined) && !(b.archived ?? cur.archived) && parentId
      && all.find((c) => c.id === parentId)?.archived) {
      throw new ApiError(409, { error: 'parent_archived', message: 'parent category is archived' });
    }
    if (b.archived === true && all.some((c) => c.parentId === cur.id && !c.archived)) {
      throw new ApiError(409, { error: 'has_active_children', message: 'archive or move the child categories first' });
    }
    app.sqlite.transaction(() => {
      app.db.update(categories).set(b).where(eq(categories.id, cur.id)).run();
      if (b.name !== undefined || b.parentId !== undefined) reindexSubtree(cur.id);
      audit(app.db, { actorId: req.user!.id, action: 'category.update', entity: 'category', entityId: cur.id, summary: `Updated category "${cur.name}": ${Object.keys(b).join(', ') || 'no changes'}` });
    })();
    return withPath()(find(cur.id)!);
  });

  // A drag or move renumbers several siblings: all of it lands, or none of it (any throw rolls the transaction back).
  const reorderBody = z.object({ moves: z.array(z.object({ id: z.string(), sortOrder: z.number().int(), parentId: z.string().nullable().optional() }).strict()).min(1).max(500) }).strict();
  app.post('/api/categories/reorder', { preHandler: admin }, async (req) => {
    const { moves } = parse(reorderBody, req.body);
    app.sqlite.transaction(() => {
      for (const m of moves) {
        if (!find(m.id)) throw notFound();
        if (m.parentId && !find(m.parentId)) throw new ApiError(400, { error: 'invalid', message: 'unknown parentId' });
        app.db.update(categories).set({ sortOrder: m.sortOrder, ...(m.parentId !== undefined && { parentId: m.parentId }) }).where(eq(categories.id, m.id)).run();
      }
      const byId = new Map(allCategories(app).map((c) => [c.id, c]));
      for (const m of moves.filter((x) => x.parentId !== undefined)) {
        const c = byId.get(m.id)!;
        for (let x = c.parentId ? byId.get(c.parentId) : undefined, n = 0; x && n < 100; x = x.parentId ? byId.get(x.parentId) : undefined, n++) {
          if (x.id === c.id) throw new ApiError(400, { error: 'invalid', message: 'category cannot be its own descendant' });
        }
        if (!c.archived && c.parentId && byId.get(c.parentId)?.archived) throw new ApiError(409, { error: 'parent_archived', message: 'parent category is archived' });
        reindexSubtree(c.id);
      }
      audit(app.db, { actorId: req.user!.id, action: 'category.reorder', entity: 'category', entityId: moves[0]!.id,
        summary: `Reordered ${moves.length} categor${moves.length === 1 ? 'y' : 'ies'}: ${moves.map((m) => byId.get(m.id)!.name).join(', ')}` });
    })();
    return { ok: true };
  });
}

import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { categoryCreateBody, categoryPatchBody, type User } from '@ops/shared';
import { requireRole } from '../auth/policy';
import { categories } from '../db/schema';
import { ApiError, allCategories, categoryPath, hiddenCategoryIds, notFound, parse, uniqueSlug } from '../services/articles';
import { audit } from '../services/audit';
import { indexArticle } from '../services/search';

export function categoryRoutes(app: FastifyInstance) {
  const admin = requireRole('admin'); // category structure is an admin function
  const find = (id: string) => app.db.select().from(categories).where(eq(categories.id, id)).get();
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
      if (b.name !== undefined || b.parentId !== undefined) { // FTS "category" column holds the path: reindex subtree
        const after = allCategories(app), ids = new Set([cur.id]);
        for (let grew = true; grew;) {
          grew = false;
          for (const c of after) if (c.parentId && ids.has(c.parentId) && !ids.has(c.id)) { ids.add(c.id); grew = true; }
        }
        for (const a of app.sqlite.prepare('select id, category_id from articles').all() as { id: string; category_id: string | null }[]) {
          if (a.category_id && ids.has(a.category_id)) indexArticle(app.sqlite, a.id);
        }
      }
      audit(app.db, { actorId: req.user!.id, action: 'category.update', entity: 'category', entityId: cur.id, summary: `Updated category "${cur.name}": ${Object.keys(b).join(', ') || 'no changes'}` });
    })();
    return withPath()(find(cur.id)!);
  });
}

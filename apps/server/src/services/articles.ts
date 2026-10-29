import type { Database } from 'better-sqlite3';
import { and, eq } from 'drizzle-orm';
import type { ZodTypeAny, z } from 'zod';
import type { ArticleStatus, User } from '@ops/shared';
import type { Db } from '../db/client';
import { articleLinks, articles, categories, revisions } from '../db/schema';
import { can } from '../auth/policy';
import { audit } from './audit';
import { extractLinkIds, extractText } from './pm-text';
import { indexArticle } from './search';

export interface Svc { db: Db; sqlite: Database }

export class ApiError extends Error {
  constructor(public status: number, public body: Record<string, unknown> = { error: 'error' }) { super(String(body.error)); }
}
export const notFound = () => new ApiError(404, { error: 'not_found' });

export function parse<S extends ZodTypeAny>(schema: S, data: unknown): z.infer<S> {
  const r = schema.safeParse(data);
  if (!r.success) throw new ApiError(400, { error: 'invalid', issues: r.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) });
  return r.data;
}

export const slugify = (s: string) =>
  s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'item';

export function uniqueSlug(sqlite: Database, table: 'articles' | 'categories', title: string, excludeId?: string): string {
  const base = slugify(title);
  const stmt = sqlite.prepare(`select 1 from ${table} where slug = ? and id != ?`);
  for (let i = 1; ; i++) {
    const s = i === 1 ? base : `${base}-${i}`;
    if (!stmt.get(s, excludeId ?? '')) return s;
  }
}

// ---- categories helpers (shared by search/routes) ----
interface CatRow { id: string; parentId: string | null; name: string; archived: boolean }

export function categoryPath(cats: { id: string; parentId: string | null; name: string }[], id: string): string {
  const byId = new Map(cats.map((c) => [c.id, c]));
  const names: string[] = [];
  for (let c = byId.get(id), n = 0; c && n < 50; c = c.parentId ? byId.get(c.parentId) : undefined, n++) names.unshift(c.name);
  return names.join(' / ');
}

/** Category ids viewers must not see: archived, or below an archived ancestor. Only viewers are restricted. */
export function hiddenCategoryIds(cats: CatRow[], user: User): string[] {
  if (user.role !== 'viewer') return [];
  const byId = new Map(cats.map((c) => [c.id, c]));
  return cats.filter((c) => {
    for (let x: CatRow | undefined = c, n = 0; x && n < 50; x = x.parentId ? byId.get(x.parentId) : undefined, n++) if (x.archived) return true;
    return false;
  }).map((c) => c.id);
}

export function allCategories(s: Svc): (CatRow & { slug: string; description: string | null; sortOrder: number })[] {
  return s.db.select().from(categories).all();
}

/**
 * SQL predicate (alias `a` = articles) mirroring can('article:read'):
 * viewer: published in a visible category; editor: any status (search excludes archived); admin: all.
 */
export function visibility(user: User, hidden: string[], a: string, o: { includeArchived: boolean }): { sql: string; params: unknown[] } {
  if (user.role === 'admin') return { sql: '1=1', params: [] };
  if (user.role === 'editor') return o.includeArchived ? { sql: '1=1', params: [] } : { sql: `${a}.status != 'archived'`, params: [] };
  return {
    sql: `${a}.status = 'published' and (${a}.category_id is null or ${a}.category_id not in (select value from json_each(?)))`,
    params: [JSON.stringify(hidden)],
  };
}

export function requireApproval(sqlite: Database): boolean {
  const r = sqlite.prepare("select value from settings where key = 'requireApproval'").get() as { value: string } | undefined;
  try { return r ? JSON.parse(r.value) === true : false; } catch { return false; }
}

type ArticleRow = typeof articles.$inferSelect;

/** Row if the user may read it, else null (callers answer 404 so existence is not leaked). */
export function readable(s: Svc, user: User, id: string): ArticleRow | null {
  const a = s.db.select().from(articles).where(eq(articles.id, id)).get();
  if (!a || !can(user, 'article:read', { status: a.status })) return null;
  if (user.role === 'viewer' && a.categoryId && hiddenCategoryIds(allCategories(s), user).includes(a.categoryId)) return null;
  return a;
}

export function tagsOf(sqlite: Database, id: string): string[] {
  return (sqlite.prepare('select t.name from article_tags x join tags t on t.id = x.tag_id where x.article_id = ? order by t.name').all(id) as { name: string }[]).map((t) => t.name);
}

function setTags(sqlite: Database, id: string, names: string[]) {
  const norm = [...new Set(names.map((n) => n.trim().toLowerCase()).filter(Boolean))];
  sqlite.prepare('delete from article_tags where article_id = ?').run(id);
  for (const n of norm) {
    sqlite.prepare('insert or ignore into tags(id, name) values (?, ?)').run(crypto.randomUUID(), n);
    const t = sqlite.prepare('select id from tags where name = ?').get(n) as { id: string };
    sqlite.prepare('insert into article_tags(article_id, tag_id) values (?, ?)').run(id, t.id);
  }
}

function syncLinks(s: Svc, id: string, content: unknown) {
  s.db.delete(articleLinks).where(and(eq(articleLinks.fromArticleId, id), eq(articleLinks.kind, 'inline'))).run();
  for (const to of extractLinkIds(content)) {
    if (to === id || !s.db.select({ id: articles.id }).from(articles).where(eq(articles.id, to)).get()) continue; // dangling ids ignored
    s.db.insert(articleLinks).values({ fromArticleId: id, toArticleId: to, kind: 'inline' }).run();
  }
}

export function view(s: Svc, a: ArticleRow, user: User) {
  const { contentText: _t, ...rest } = a;
  const cats = allCategories(s);
  const linkTargets: Record<string, { status: string; title?: string; slug?: string }> = {};
  for (const l of s.db.select().from(articleLinks).where(and(eq(articleLinks.fromArticleId, a.id), eq(articleLinks.kind, 'inline'))).all()) {
    const t = readable(s, user, l.toArticleId);
    const raw = s.db.select({ status: articles.status }).from(articles).where(eq(articles.id, l.toArticleId)).get();
    linkTargets[l.toArticleId] = t ? { status: t.status, title: t.title, slug: t.slug } : { status: raw?.status === 'archived' ? 'archived' : 'unavailable' };
  }
  return {
    ...rest, content: JSON.parse(a.content), fields: JSON.parse(a.fields),
    tags: tagsOf(s.sqlite, a.id), categoryPath: a.categoryId ? categoryPath(cats, a.categoryId) : '', linkTargets,
  };
}

function checkCategory(s: Svc, id: string | null | undefined) {
  if (id && !s.db.select({ id: categories.id }).from(categories).where(eq(categories.id, id)).get()) throw new ApiError(400, { error: 'invalid', message: 'unknown categoryId' });
}

const EMPTY_DOC = { type: 'doc', content: [] };

export function createArticle(s: Svc, user: User, b: { title: string; type?: ArticleRow['type']; categoryId?: string | null; content?: unknown; fields?: Record<string, unknown>; tags?: string[]; reviewDate?: string | null }) {
  if (!can(user, 'article:write', {})) throw new ApiError(403, { error: 'forbidden' });
  checkCategory(s, b.categoryId);
  return s.sqlite.transaction(() => {
    const id = crypto.randomUUID(), now = new Date().toISOString(), content = b.content ?? EMPTY_DOC;
    const row = {
      id, slug: uniqueSlug(s.sqlite, 'articles', b.title), title: b.title, type: b.type ?? 'standard', status: 'draft' as const,
      categoryId: b.categoryId ?? null, ownerId: user.id, content: JSON.stringify(content), contentText: extractText(content),
      fields: JSON.stringify(b.fields ?? {}), reviewDate: b.reviewDate ?? null, revision: 1, createdAt: now, updatedAt: now, publishedAt: null,
    };
    s.db.insert(articles).values(row).run();
    s.db.insert(revisions).values({ articleId: id, rev: 1, title: row.title, content: row.content, fields: row.fields, authorId: user.id, createdAt: now, note: 'created' }).run();
    setTags(s.sqlite, id, b.tags ?? []);
    syncLinks(s, id, content);
    indexArticle(s.sqlite, id);
    audit(s.db, { actorId: user.id, action: 'article.create', entity: 'article', entityId: id, summary: `Created "${row.title}"` });
    return id;
  })();
}

export function updateArticle(s: Svc, user: User, id: string, b: {
  baseRevision: number; title?: string; type?: ArticleRow['type']; categoryId?: string | null; content?: unknown;
  fields?: Record<string, unknown>; tags?: string[]; reviewDate?: string | null; note?: string;
}) {
  checkCategory(s, b.categoryId);
  return s.sqlite.transaction(() => {
    const cur = readable(s, user, id);
    if (!cur) throw notFound();
    if (!can(user, 'article:write', { status: cur.status, ownerId: cur.ownerId ?? undefined })) throw new ApiError(403, { error: 'forbidden' });
    if (cur.revision !== b.baseRevision) throw new ApiError(409, { error: 'conflict', current: { revision: cur.revision, updatedAt: cur.updatedAt } });
    const now = new Date().toISOString(), title = b.title ?? cur.title;
    const content = b.content !== undefined ? JSON.stringify(b.content) : cur.content;
    const fields = b.fields !== undefined ? JSON.stringify(b.fields) : cur.fields;
    const rev = cur.revision + 1;
    s.db.update(articles).set({
      title, type: b.type ?? cur.type, categoryId: b.categoryId === undefined ? cur.categoryId : b.categoryId,
      content, contentText: b.content !== undefined ? extractText(b.content) : cur.contentText, fields,
      reviewDate: b.reviewDate === undefined ? cur.reviewDate : b.reviewDate,
      slug: !cur.publishedAt && title !== cur.title ? uniqueSlug(s.sqlite, 'articles', title, id) : cur.slug, // stable once published
      revision: rev, updatedAt: now,
    }).where(eq(articles.id, id)).run();
    s.db.insert(revisions).values({ articleId: id, rev, title, content, fields, authorId: user.id, createdAt: now, note: b.note ?? null }).run();
    if (b.tags) setTags(s.sqlite, id, b.tags);
    if (b.content !== undefined) syncLinks(s, id, b.content);
    indexArticle(s.sqlite, id);
    audit(s.db, { actorId: user.id, action: 'article.update', entity: 'article', entityId: id, summary: `Saved revision ${rev} of "${title}"` });
    return id;
  })();
}

const TRANSITIONS = {
  submit: { from: ['draft'], to: 'in_review' },
  publish: { from: ['draft', 'in_review'], to: 'published' },
  archive: { from: ['draft', 'in_review', 'published'], to: 'archived' },
  restore: { from: ['archived'], to: 'draft' },
} as const satisfies Record<string, { from: readonly ArticleStatus[]; to: ArticleStatus }>;
export type Transition = keyof typeof TRANSITIONS;

export function transition(s: Svc, user: User, id: string, action: Transition) {
  return s.sqlite.transaction(() => {
    const cur = readable(s, user, id);
    if (!cur) throw notFound();
    const t = TRANSITIONS[action];
    const perm = action === 'submit' ? 'article:submit' : action === 'publish' ? 'article:publish' : 'article:archive';
    if (!can(user, perm, { status: cur.status }, { requireApproval: requireApproval(s.sqlite) })) throw new ApiError(403, { error: 'forbidden' });
    if (!(t.from as readonly string[]).includes(cur.status)) throw new ApiError(409, { error: 'invalid_transition', status: cur.status });
    const now = new Date().toISOString();
    s.db.update(articles).set({ status: t.to, updatedAt: now, publishedAt: action === 'publish' ? (cur.publishedAt ?? now) : cur.publishedAt }).where(eq(articles.id, id)).run();
    indexArticle(s.sqlite, id);
    audit(s.db, { actorId: user.id, action: `article.${action}`, entity: 'article', entityId: id, summary: `${action}: "${cur.title}" ${cur.status} -> ${t.to}` });
    return id;
  })();
}

export function restoreRevision(s: Svc, user: User, id: string, rev: number) {
  return s.sqlite.transaction(() => {
    const cur = readable(s, user, id);
    if (!cur) throw notFound();
    if (!can(user, 'article:write', { status: cur.status })) throw new ApiError(403, { error: 'forbidden' });
    const old = s.db.select().from(revisions).where(and(eq(revisions.articleId, id), eq(revisions.rev, rev))).get();
    if (!old) throw notFound();
    const now = new Date().toISOString(), next = cur.revision + 1;
    s.db.update(articles).set({
      title: old.title, content: old.content, contentText: extractText(JSON.parse(old.content)), fields: old.fields,
      slug: !cur.publishedAt && old.title !== cur.title ? uniqueSlug(s.sqlite, 'articles', old.title, id) : cur.slug,
      revision: next, updatedAt: now,
    }).where(eq(articles.id, id)).run();
    s.db.insert(revisions).values({ articleId: id, rev: next, title: old.title, content: old.content, fields: old.fields, authorId: user.id, createdAt: now, note: `restored from revision ${rev}` }).run();
    syncLinks(s, id, JSON.parse(old.content));
    indexArticle(s.sqlite, id);
    audit(s.db, { actorId: user.id, action: 'article.revision_restore', entity: 'article', entityId: id, summary: `Restored revision ${rev} as ${next}` });
    return id;
  })();
}

/** Editors/admins only; viewers get 404 even for published articles. */
export function revisionsOf(s: Svc, user: User, id: string) {
  if (user.role === 'viewer' || !readable(s, user, id)) throw notFound();
  return s.db.select().from(revisions).where(eq(revisions.articleId, id)).all().sort((a, b) => b.rev - a.rev)
    .map(({ content: _c, fields: _f, ...r }) => r);
}

export function backlinks(s: Svc, user: User, id: string) {
  if (!readable(s, user, id)) throw notFound();
  return s.db.select().from(articleLinks).where(eq(articleLinks.toArticleId, id)).all()
    .map((l) => readable(s, user, l.fromArticleId)).filter((a): a is ArticleRow => !!a)
    .map((a) => ({ id: a.id, title: a.title, slug: a.slug, status: a.status }));
}

export function listArticles(s: Svc, user: User, f: { status?: string; categoryId?: string; type?: string; limit: number; offset: number }) {
  const cats = allCategories(s);
  const vis = visibility(user, hiddenCategoryIds(cats, user), 'a', { includeArchived: true });
  const where = [vis.sql], params: unknown[] = [...vis.params];
  for (const [col, v] of [['status', f.status], ['category_id', f.categoryId], ['type', f.type]] as const) if (v) { where.push(`a.${col} = ?`); params.push(v); }
  const rows = s.sqlite.prepare(
    `select a.id, a.slug, a.title, a.type, a.status, a.category_id as categoryId, a.owner_id as ownerId, a.revision, a.updated_at as updatedAt, a.published_at as publishedAt, a.review_date as reviewDate
     from articles a where ${where.join(' and ')} order by a.updated_at desc limit ? offset ?`,
  ).all(...params, f.limit, f.offset) as ({ categoryId: string | null } & Record<string, unknown>)[];
  return rows.map((r) => ({ ...r, categoryPath: r.categoryId ? categoryPath(cats, r.categoryId) : '' }));
}

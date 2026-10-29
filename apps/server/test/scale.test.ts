import { describe, it, expect, beforeAll } from 'vitest';
import { setup, doc, type Ctx } from './helpers';

// Browsing must not silently stop at the newest 200 articles (the old web-side cap): paging, subtree filter, counts, title search.
let c: Ctx, parent: string, child: string, oldestId: string;
beforeAll(async () => {
  c = await setup();
  parent = (await c.req(c.admin, 'POST', '/api/categories', { name: 'Big' })).body.id;
  child = (await c.req(c.admin, 'POST', '/api/categories', { name: 'Big child', parentId: parent })).body.id;
  for (let i = 0; i < 250; i++) {
    const a = (await c.req(c.editor, 'POST', '/api/articles', { title: `Bulk ${String(i).padStart(3, '0')}${i === 0 ? ' oldest needle' : ''}`, categoryId: i % 2 ? child : parent, content: doc('x') })).body;
    expect((await c.req(c.editor, 'POST', `/api/articles/${a.id}/publish`)).status).toBe(200);
    if (i === 0) oldestId = a.id;
  }
  for (let i = 0; i < 3; i++) await c.req(c.editor, 'POST', '/api/articles', { title: `Draft ${i}`, categoryId: child });
}, 120_000);

const list = async (cookie: string, qs: string) => (await c.req(cookie, 'GET', `/api/articles?${qs}`)).body as { articles: { id: string; title: string; status: string }[]; total: number };

describe('article listing at scale', () => {
  it('pages through a whole category subtree; the oldest article is reachable; total is exact', async () => {
    const p1 = await list(c.viewer, `within=${parent}&limit=200&sort=title`);
    expect(p1.total).toBe(250);
    expect(p1.articles).toHaveLength(200);
    const p2 = await list(c.viewer, `within=${parent}&limit=200&offset=200&sort=title`);
    expect(p2.articles).toHaveLength(50);
    const ids = new Set([...p1.articles, ...p2.articles].map((a) => a.id));
    expect(ids.size).toBe(250);
    expect(ids.has(oldestId)).toBe(true);
    const titles = p1.articles.map((a) => a.title);
    expect(titles).toEqual([...titles].sort((a, b) => a.localeCompare(b)));
  });
  it('within = only that subtree; drafts only for writers', async () => {
    expect((await list(c.viewer, `within=${child}&limit=1`)).total).toBe(125);
    expect((await list(c.editor, `within=${child}&limit=1`)).total).toBe(128);
  });
  it('title search finds an article older than the newest 200', async () => {
    const r = await list(c.viewer, 'q=oldest%20needle&limit=50');
    expect(r.articles.map((a) => a.id)).toEqual([oldestId]);
    expect((await list(c.viewer, 'q=%25&limit=1')).total).toBe(0); // LIKE wildcards are literal
  });
  it('ownerId filter', async () => {
    const me = (await c.req(c.editor, 'GET', '/api/me')).body.user;
    expect((await list(c.admin, `ownerId=${me.id}&limit=1`)).total).toBe(253);
    expect((await list(c.admin, 'ownerId=none&limit=1')).total).toBe(0);
  });
  it('GET /api/articles/counts: per category and status, visibility applied', async () => {
    const counts = async (cookie: string) => (await c.req(cookie, 'GET', '/api/articles/counts')).body.counts as { categoryId: string | null; status: string; n: number }[];
    const v = await counts(c.viewer);
    const sum = (rows: typeof v, cat: string, st?: string) => rows.filter((r) => r.categoryId === cat && (!st || r.status === st)).reduce((n, r) => n + r.n, 0);
    expect(sum(v, parent) + sum(v, child)).toBe(250);
    expect(v.every((r) => r.status === 'published')).toBe(true);
    const e = await counts(c.editor);
    expect(sum(e, child, 'draft')).toBe(3);
    expect((await c.req(undefined, 'GET', '/api/articles/counts')).status).toBe(401);
  });
});

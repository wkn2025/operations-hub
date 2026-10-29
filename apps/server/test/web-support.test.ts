import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setup, doc, type Ctx } from './helpers';
import { seedBase, CATEGORY_TREE } from '../src/seed/base';

let c: Ctx;
beforeEach(async () => { c = await setup(mkdtempSync(join(tmpdir(), 'ops-web-'))); });

describe('article by slug + owner', () => {
  it('GET /api/articles/:slug resolves like an id and keeps visibility rules', async () => {
    const a = (await c.req(c.editor, 'POST', '/api/articles', { title: 'Slug Me', content: doc('x') })).body;
    expect((await c.req(c.viewer, 'GET', `/api/articles/${a.slug}`)).status).toBe(404); // draft
    await c.req(c.editor, 'POST', `/api/articles/${a.id}/publish`);
    const got = await c.req(c.viewer, 'GET', `/api/articles/${a.slug}`);
    expect(got.status).toBe(200);
    expect(got.body.id).toBe(a.id);
    expect(got.body.owner).toMatchObject({ name: expect.any(String) });
    expect(got.body.owner.email).toBeUndefined();
  });
});

describe('seedBase', () => {
  it('is idempotent and creates categories, users, one published article per template', async () => {
    await seedBase(c.app);
    await seedBase(c.app);
    const cats = c.app.sqlite.prepare('select name, parent_id from categories').all() as { name: string; parent_id: string | null }[];
    const top = cats.filter((x) => !x.parent_id).map((x) => x.name);
    expect(top.sort()).toEqual(CATEGORY_TREE.map((t) => t.name).sort());
    expect(top).toHaveLength(9);
    expect(cats.length).toBe(9 + CATEGORY_TREE.reduce((n, t) => n + t.children.length, 0));
    for (const t of CATEGORY_TREE) expect(t.children.length).toBeGreaterThanOrEqual(2);

    const users = c.app.sqlite.prepare('select email, role from users').all() as { email: string; role: string }[];
    expect(users).toEqual(expect.arrayContaining([
      { email: 'admin@demo.test', role: 'admin' }, { email: 'editor@demo.test', role: 'editor' }, { email: 'viewer@demo.test', role: 'viewer' },
    ]));
    expect(c.app.sqlite.prepare("select 1 from editor_allowlist where email = 'editor@demo.test'").get()).toBeTruthy();

    const arts = c.app.sqlite.prepare("select id, type, status, content from articles").all() as { id: string; type: string; status: string; content: string }[];
    expect(arts.length).toBeGreaterThanOrEqual(8);
    expect(arts.every((a) => a.status === 'published')).toBe(true);
    expect(new Set(arts.map((a) => a.type)).size).toBe(6);
    expect(arts.every((a) => a.content.includes('DEMO'))).toBe(true);
    // second run must not create extra revisions
    const revs = (c.app.sqlite.prepare('select count(*) n from revisions').get() as { n: number }).n;
    await seedBase(c.app);
    expect((c.app.sqlite.prepare('select count(*) n from revisions').get() as { n: number }).n).toBe(revs);

    // internal links resolve, embedded SVG screenshot is readable by a viewer
    const links = c.app.sqlite.prepare("select count(*) n from article_links").get() as { n: number };
    expect(links.n).toBeGreaterThan(0);
    const img = c.app.sqlite.prepare("select file_id from article_files").get() as { file_id: string };
    const r = await c.app.inject({ method: 'GET', url: `/api/files/${img.file_id}`, headers: { cookie: c.viewer } });
    expect(r.statusCode).toBe(200);
    expect(r.headers['content-type']).toContain('image/svg+xml');
  });
});

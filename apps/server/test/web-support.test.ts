import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setup, doc, type Ctx } from './helpers';
import { seedBase, seedAllowed, seedCategories, CATEGORY_TREE } from '../src/seed/base';

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

describe('seed guard', () => {
  it('refuses oidc or production unless --force-demo', () => {
    expect(() => seedAllowed({ AUTH_MODE: 'oidc', NODE_ENV: 'development' }, [])).toThrow(/refus/i);
    expect(() => seedAllowed({ NODE_ENV: 'production' }, [])).toThrow(/refus/i);
    expect(() => seedAllowed({ NODE_ENV: 'production', AUTH_MODE: 'oidc' }, ['--force-demo'])).not.toThrow();
    expect(() => seedAllowed({ AUTH_MODE: 'dev', NODE_ENV: 'development' }, [])).not.toThrow();
    expect(() => seedAllowed({}, [])).not.toThrow();
    expect(() => seedAllowed({ NODE_ENV: 'production', AUTH_MODE: 'oidc' }, ['--categories-only'])).not.toThrow();
  });

  it('--categories-only path: the 8 top-level categories, idempotent, no demo users or articles', () => {
    seedCategories(c.app);
    seedCategories(c.app);
    const cats = c.app.sqlite.prepare('select name, parent_id, description from categories').all() as { name: string; parent_id: string | null; description: string | null }[];
    expect(cats.map((x) => x.name).sort()).toEqual(CATEGORY_TREE.map((t) => t.name).sort());
    expect(cats).toHaveLength(8);
    expect(cats.every((x) => !x.parent_id && x.description)).toBe(true);
    expect(c.app.sqlite.prepare("select count(*) n from users where email like '%@demo.test'").get()).toEqual({ n: 0 });
    expect(c.app.sqlite.prepare('select count(*) n from articles').get()).toEqual({ n: 0 });
  });

  it('does not reuse a same-named file uploaded by someone else', async () => {
    const other = c.app.sqlite.prepare("select id from users where email = 'ed@x.test'").get() as { id: string };
    c.app.sqlite.prepare("insert into files(id,name,mime,size,path,uploaded_by,created_at) values('fake','demo-globo-case.svg','image/svg+xml',1,'fake',?,?)").run(other.id, new Date().toISOString());
    await seedBase(c.app);
    const src = c.app.sqlite.prepare("select f.id, u.email from article_files x join files f on f.id = x.file_id join users u on u.id = f.uploaded_by").all() as { id: string; email: string }[];
    expect(src.length).toBeGreaterThan(0);
    expect(src.every((r) => r.id !== 'fake' && r.email === 'admin@demo.test')).toBe(true);
    const n = (c.app.sqlite.prepare("select count(*) n from files where name = 'demo-globo-case.svg'").get() as { n: number }).n;
    await seedBase(c.app);
    expect((c.app.sqlite.prepare("select count(*) n from files where name = 'demo-globo-case.svg'").get() as { n: number }).n).toBe(n); // own file reused
  });
});

describe('seedBase', () => {
  it('is idempotent and creates categories, users, one published article per template', async () => {
    await seedBase(c.app);
    await seedBase(c.app);
    const cats = c.app.sqlite.prepare('select name, parent_id from categories').all() as { name: string; parent_id: string | null }[];
    const top = cats.filter((x) => !x.parent_id).map((x) => x.name);
    expect(top.sort()).toEqual(CATEGORY_TREE.map((t) => t.name).sort());
    expect(top).toHaveLength(8);
    expect(cats.length).toBe(8 + CATEGORY_TREE.reduce((n, t) => n + t.children.length, 0));
    for (const t of CATEGORY_TREE.filter((x) => x.name !== 'Clients & Terms and Conditions')) expect(t.children.length).toBeGreaterThanOrEqual(2); // clients: one A–Z directory

    const users = c.app.sqlite.prepare('select email, role from users').all() as { email: string; role: string }[];
    expect(users).toEqual(expect.arrayContaining([
      { email: 'admin@demo.test', role: 'admin' }, { email: 'editor@demo.test', role: 'editor' }, { email: 'viewer@demo.test', role: 'viewer' },
    ]));
    expect(c.app.sqlite.prepare("select 1 from editor_allowlist where email = 'editor@demo.test'").get()).toBeTruthy();

    const arts = c.app.sqlite.prepare("select id, title, type, status, content from articles").all() as { id: string; title: string; type: string; status: string; content: string }[];
    expect(arts.length).toBeGreaterThanOrEqual(8);
    expect(arts.every((a) => a.status === 'published')).toBe(true);
    expect(new Set(arts.map((a) => a.type)).size).toBe(6);
    // everything is DEMO-labelled except the real EDI procedure (EDI 101 rework) and Country Specifics
    expect(arts.filter((a) => !a.content.includes('DEMO')).map((a) => a.title).sort()).toEqual([
      '835 payment file', '837 Health Care Claim', 'Adjudicating an EDI invoice: reductions, denials and MRR', 'Barbados: country specifics',
      'Changing a coverage decision on an EDI invoice', 'Cuba: country specifics', 'EDI 101: the three files and the loop', 'EDI claim failed to import',
      'EDI denial codes', 'Importing EDI invoices into Globo: the three checks', 'Mexico: country specifics', 'PCF file',
      'web.transformer: All Entries', 'web.transformer: Manual Handling', 'web.transformer: Missing Claim', 'web.transformer: Missing GOP',
    ]);
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

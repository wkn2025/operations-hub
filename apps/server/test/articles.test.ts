import { describe, it, expect, beforeEach } from 'vitest';
import { setup, doc, type Ctx } from './helpers';
import { extractText, extractLinkIds } from '../src/services/pm-text';

let c: Ctx;
beforeEach(async () => { c = await setup(); });
const create = async (body: any = {}, who = c.editor) =>
  (await c.req(who, 'POST', '/api/articles', { title: 'Hello World', content: doc('first'), ...body })).body;

describe('pm-text', () => {
  it('extracts text, internalLink labels, image alt', () => {
    const d = { type: 'doc', content: [
      { type: 'paragraph', content: [{ type: 'text', text: 'alpha' }, { type: 'internalLink', attrs: { articleId: 'x', label: 'Beta page' } }] },
      { type: 'steps', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'gamma' }] }] },
      { type: 'image', attrs: { src: '/f/1', alt: 'delta' } },
    ] };
    const t = extractText(d);
    for (const w of ['alpha', 'Beta page', 'gamma', 'delta']) expect(t).toContain(w);
    expect(extractLinkIds(d)).toEqual(['x']);
    expect(extractText(null as any)).toBe('');
  });
});

describe('articles', () => {
  it('create makes draft rev 1 with unique slug', async () => {
    const a = await create(); const b = await create();
    expect(a.status).toBe('draft'); expect(a.revision).toBe(1);
    expect(a.slug).toBe('hello-world'); expect(b.slug).toBe('hello-world-2');
  });
  it('viewer/anonymous cannot create', async () => {
    expect((await c.req(c.viewer, 'POST', '/api/articles', { title: 'x' })).status).toBe(403);
    expect((await c.req(undefined, 'POST', '/api/articles', { title: 'x' })).status).toBe(401);
  });
  it('invalid payload is 400', async () => {
    expect((await c.req(c.editor, 'POST', '/api/articles', { title: '' })).status).toBe(400);
    const a = await create();
    expect((await c.req(c.editor, 'PATCH', `/api/articles/${a.id}`, { title: 'x' })).status).toBe(400); // baseRevision required
  });
  it('revision per save, listable, restorable', async () => {
    const a = await create();
    const p1 = await c.req(c.editor, 'PATCH', `/api/articles/${a.id}`, { baseRevision: 1, title: 'V2', content: doc('second') });
    expect(p1.status).toBe(200); expect(p1.body.revision).toBe(2);
    await c.req(c.editor, 'PATCH', `/api/articles/${a.id}`, { baseRevision: 2, content: doc('third') });
    const revs = (await c.req(c.editor, 'GET', `/api/articles/${a.id}/revisions`)).body.revisions;
    expect(revs.map((r: any) => r.rev)).toEqual([3, 2, 1]);
    const r = await c.req(c.editor, 'POST', `/api/articles/${a.id}/revisions/1/restore`);
    expect(r.status).toBe(200); expect(r.body.revision).toBe(4);
    const cur = (await c.req(c.editor, 'GET', `/api/articles/${a.id}`)).body;
    expect(cur.title).toBe('Hello World');
    expect(extractText(cur.content)).toContain('first');
    expect((await c.req(c.editor, 'POST', `/api/articles/${a.id}/revisions/99/restore`)).status).toBe(404);
  });
  it('stale baseRevision -> 409 with current revision', async () => {
    const a = await create();
    await c.req(c.editor, 'PATCH', `/api/articles/${a.id}`, { baseRevision: 1, title: 'E1' });
    const r = await c.req(c.editor2, 'PATCH', `/api/articles/${a.id}`, { baseRevision: 1, title: 'E2' });
    expect(r.status).toBe(409);
    expect(r.body.error).toBe('conflict');
    expect(r.body.current.revision).toBe(2);
    expect(r.body.current.updatedAt).toBeTruthy();
    expect((await c.req(c.editor, 'GET', `/api/articles/${a.id}`)).body.title).toBe('E1');
  });
  it('viewer gets 404 for draft, in_review and archived by id, list and revisions; 401 anonymous', async () => {
    const a = await create();
    expect((await c.req(c.viewer, 'GET', `/api/articles/${a.id}`)).status).toBe(404);
    expect((await c.req(c.viewer, 'GET', `/api/articles/${a.id}/revisions`)).status).toBe(404);
    expect((await c.req(c.viewer, 'GET', `/api/articles/${a.id}/backlinks`)).status).toBe(404);
    expect((await c.req(c.viewer, 'GET', '/api/articles')).body.articles).toHaveLength(0);
    await c.req(c.editor, 'POST', `/api/articles/${a.id}/submit`);
    expect((await c.req(c.viewer, 'GET', `/api/articles/${a.id}`)).status).toBe(404);
    await c.req(c.editor, 'POST', `/api/articles/${a.id}/publish`);
    expect((await c.req(c.viewer, 'GET', `/api/articles/${a.id}`)).status).toBe(200);
    expect((await c.req(c.viewer, 'GET', `/api/articles/${a.id}/revisions`)).status).toBe(404); // viewers never see history
    expect((await c.req(c.viewer, 'GET', '/api/articles')).body.articles).toHaveLength(1);
    await c.req(c.editor, 'POST', `/api/articles/${a.id}/archive`);
    expect((await c.req(c.viewer, 'GET', `/api/articles/${a.id}`)).status).toBe(404);
    expect((await c.req(undefined, 'GET', `/api/articles/${a.id}`)).status).toBe(401);
    expect((await c.req(c.viewer, 'GET', '/api/articles/nope')).status).toBe(404);
  });
  it('status workflow: submit/publish/archive/restore; invalid transitions 409', async () => {
    const a = await create();
    expect((await c.req(c.editor, 'POST', `/api/articles/${a.id}/restore`)).status).toBe(409);
    expect((await c.req(c.editor, 'POST', `/api/articles/${a.id}/submit`)).body.status).toBe('in_review');
    const pub = (await c.req(c.editor, 'POST', `/api/articles/${a.id}/publish`)).body;
    expect(pub.status).toBe('published'); expect(pub.publishedAt).toBeTruthy();
    expect((await c.req(c.editor, 'POST', `/api/articles/${a.id}/submit`)).status).toBe(409);
    expect((await c.req(c.editor, 'POST', `/api/articles/${a.id}/archive`)).body.status).toBe('archived');
    expect((await c.req(c.editor, 'POST', `/api/articles/${a.id}/restore`)).body.status).toBe('draft');
  });
  it('requireApproval: editor cannot publish, admin can', async () => {
    c.app.sqlite.prepare("insert into settings(key,value) values('requireApproval','true')").run();
    const a = await create();
    await c.req(c.editor, 'POST', `/api/articles/${a.id}/submit`);
    expect((await c.req(c.editor, 'POST', `/api/articles/${a.id}/publish`)).status).toBe(403);
    expect((await c.req(c.admin, 'POST', `/api/articles/${a.id}/publish`)).body.status).toBe('published');
  });
  it('slug is stable after publish; changes with title before', async () => {
    const a = await create();
    expect((await c.req(c.editor, 'PATCH', `/api/articles/${a.id}`, { baseRevision: 1, title: 'New Name' })).body.slug).toBe('new-name');
    await c.req(c.editor, 'POST', `/api/articles/${a.id}/publish`);
    expect((await c.req(c.editor, 'PATCH', `/api/articles/${a.id}`, { baseRevision: 2, title: 'Third' })).body.slug).toBe('new-name');
  });
  it('editor cannot edit archived article', async () => {
    const a = await create();
    await c.req(c.editor, 'POST', `/api/articles/${a.id}/archive`);
    expect((await c.req(c.editor, 'PATCH', `/api/articles/${a.id}`, { baseRevision: 1, title: 'z' })).status).toBe(403);
  });
  it('internal links sync to article_links, backlinks exposed; archived target does not crash', async () => {
    const target = await create({ title: 'Target' });
    await c.req(c.editor, 'POST', `/api/articles/${target.id}/publish`);
    const link = { type: 'internalLink', attrs: { articleId: target.id, label: 'Target' } };
    const src = await create({ title: 'Source', content: { type: 'doc', content: [{ type: 'paragraph', content: [link, { type: 'internalLink', attrs: { articleId: 'ghost' } }] }] } });
    await c.req(c.editor, 'POST', `/api/articles/${src.id}/publish`);
    const bl = (await c.req(c.viewer, 'GET', `/api/articles/${target.id}/backlinks`)).body.backlinks;
    expect(bl.map((b: any) => b.id)).toEqual([src.id]);
    await c.req(c.editor, 'POST', `/api/articles/${target.id}/archive`);
    const got = await c.req(c.viewer, 'GET', `/api/articles/${src.id}`);
    expect(got.status).toBe(200);
    expect(got.body.linkTargets[target.id].status).toBe('archived');
    expect(got.body.linkTargets[target.id].title).toBeUndefined(); // viewers learn nothing else
    expect(got.body.linkTargets.ghost).toBeUndefined();
    await c.req(c.editor, 'PATCH', `/api/articles/${src.id}`, { baseRevision: 1, content: doc('none') });
    expect(c.app.sqlite.prepare('select count(*) n from article_links').get()).toEqual({ n: 0 });
  });
  it('tags are saved and returned', async () => {
    const a = await create({ tags: ['EDI', 'edi', ' 837 '] });
    expect((await c.req(c.editor, 'GET', `/api/articles/${a.id}`)).body.tags).toEqual(['837', 'edi']);
  });
  it('every write is audited', async () => {
    const a = await create();
    await c.req(c.editor, 'PATCH', `/api/articles/${a.id}`, { baseRevision: 1, title: 'x' });
    await c.req(c.editor, 'POST', `/api/articles/${a.id}/submit`);
    await c.req(c.editor, 'POST', `/api/articles/${a.id}/publish`);
    await c.req(c.editor, 'POST', `/api/articles/${a.id}/revisions/1/restore`);
    await c.req(c.editor, 'POST', `/api/articles/${a.id}/archive`);
    await c.req(c.editor, 'POST', `/api/articles/${a.id}/restore`);
    const rows = c.app.sqlite.prepare("select action, actor_id from audit_log where entity='article'").all() as any[];
    expect(rows.map((r) => r.action)).toEqual(['article.create', 'article.update', 'article.submit', 'article.publish', 'article.revision_restore', 'article.archive', 'article.restore']);
    expect(rows.every((r) => r.actor_id)).toBe(true);
  });
});

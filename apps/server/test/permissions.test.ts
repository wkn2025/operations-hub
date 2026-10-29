import { describe, it, expect, beforeEach } from 'vitest';
import { setup, doc, type Ctx } from './helpers';

let c: Ctx;
beforeEach(async () => { c = await setup(); });

describe('write endpoints reject anonymous (401) and viewer (403) and change nothing', () => {
  it('loops over all writes', async () => {
    const art = (await c.req(c.editor, 'POST', '/api/articles', { title: 'T', content: doc('x') })).body.id;
    await c.req(c.editor, 'POST', `/api/articles/${art}/publish`);
    const cat = (await c.req(c.admin, 'POST', '/api/categories', { name: 'C' })).body.id;
    const writes: [string, string, unknown][] = [
      ['POST', '/api/categories', { name: 'N' }],
      ['PATCH', `/api/categories/${cat}`, { name: 'N' }],
      ['POST', '/api/articles', { title: 'N' }],
      ['PATCH', `/api/articles/${art}`, { baseRevision: 1, title: 'N' }],
      ['POST', `/api/articles/${art}/publish`, undefined],
      ['POST', `/api/articles/${art}/submit`, undefined],
      ['POST', `/api/articles/${art}/archive`, undefined],
      ['POST', `/api/articles/${art}/restore`, undefined],
      ['POST', `/api/articles/${art}/revisions/1/restore`, undefined],
    ];
    const snap = () => c.app.sqlite.prepare('select (select count(*) from audit_log) a, (select count(*) from articles) b, (select count(*) from categories) c, (select group_concat(title || status || revision) from articles) t').get();
    const before = snap();
    for (const [m, u, p] of writes) {
      expect((await c.req(undefined, m, u, p)).status, `anon ${m} ${u}`).toBe(401);
      expect((await c.req(c.viewer, m, u, p)).status, `viewer ${m} ${u}`).toBe(403);
    }
    expect(snap()).toEqual(before);
    expect((await c.req(c.editor, 'POST', '/api/categories', { name: 'N' })).status).toBe(403); // categories are admin-only
  });
});

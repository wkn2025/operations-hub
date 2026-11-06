import { describe, it, expect, beforeEach } from 'vitest';
import { setup, doc, type Ctx } from './helpers';

let c: Ctx;
beforeEach(async () => { c = await setup(); });
const mk = async (b: any, publish = true) => {
  const a = (await c.req(c.editor, 'POST', '/api/articles', b)).body;
  if (publish) await c.req(c.editor, 'POST', `/api/articles/${a.id}/publish`);
  return a;
};
const search = (who: string | undefined, q: string) => c.req(who, 'GET', `/api/search?q=${encodeURIComponent(q)}`);
const hits = (r: any, kind: string) => r.body.groups.find((g: any) => g.kind === kind)?.hits ?? [];

describe('search', () => {
  it('finds by body with <mark> snippet, by tag, by client field', async () => {
    const cat = (await c.req(c.admin, 'POST', '/api/categories', { name: 'Clients' })).body.id;
    const a = await mk({ title: 'Eligibility', categoryId: cat, content: doc('The clearinghouse rejects malformed envelopes'), tags: ['x12'], fields: { client: 'Acme Health' } });
    for (const q of ['clearinghouse', 'x12', 'acme']) {
      const h = hits(await search(c.viewer, q), 'article');
      expect(h.map((x: any) => x.id), q).toEqual([a.id]);
      expect(h[0].snippet, q).toContain('<mark>');
      expect(h[0].categoryPath).toBe('Clients');
    }
    expect(hits(await search(c.viewer, 'clearing'), 'article')).toHaveLength(1); // prefix
  });
  it('index follows edits; snippet text is HTML-escaped', async () => {
    const a = await mk({ title: 'Doc', content: doc('uniqueword <script>alert(1)</script>') });
    const h = hits(await search(c.viewer, 'uniqueword'), 'article');
    expect(h[0].snippet).not.toContain('<script>');
    expect(h[0].snippet).toContain('&lt;script&gt;');
    await c.req(c.editor, 'PATCH', `/api/articles/${a.id}`, { baseRevision: 1, content: doc('replaced') });
    expect(hits(await search(c.viewer, 'uniqueword'), 'article')).toHaveLength(0);
    expect(hits(await search(c.viewer, 'replaced'), 'article')).toHaveLength(1);
  });
  it('viewer never sees draft/archived; editor sees non-archived; admin sees all', async () => {
    const d = await mk({ title: 'Zebra draft' }, false);
    const p = await mk({ title: 'Zebra published' });
    const r = await mk({ title: 'Zebra archived' }); await c.req(c.editor, 'POST', `/api/articles/${r.id}/archive`);
    const ids = (x: any) => hits(x, 'article').map((h: any) => h.id).sort();
    expect(ids(await search(c.viewer, 'zebra'))).toEqual([p.id]);
    expect(ids(await search(c.editor, 'zebra'))).toEqual([d.id, p.id].sort());
    expect(ids(await search(c.admin, 'zebra'))).toEqual([d.id, p.id, r.id].sort());
    expect((await search(undefined, 'zebra')).status).toBe(401);
  });
  it('FTS syntax characters never 500', async () => {
    await mk({ title: 'Foo bar', content: doc('foo and bar') });
    for (const q of ['"foo', 'a AND', '*', 'foo -bar', 'NEAR(', '(foo', 'col:foo', '"', "'", '^', 'foo OR', '', '   ', '%', '\\', 'a'.repeat(5000)]) {
      const r = await search(c.viewer, q);
      expect(r.status, q).toBe(200);
      expect(Array.isArray(r.body.groups)).toBe(true);
    }
    expect(hits(await search(c.viewer, '"foo'), 'article')).toHaveLength(1);
  });
  it('groups: category, tag, glossary', async () => {
    await c.req(c.admin, 'POST', '/api/categories', { name: 'Glossary & Acronyms' });
    const g = await mk({ title: 'Glossary term: ERA', type: 'glossary', content: doc('Electronic remittance advice'), tags: ['finance'] });
    const r = await search(c.viewer, 'glossary');
    expect(hits(r, 'category')).toHaveLength(1);
    expect(hits(r, 'glossary').map((h: any) => h.id)).toEqual([g.id]);
    expect(hits(r, 'article')).toHaveLength(0);
    expect(hits(await search(c.viewer, 'fin'), 'tag')[0].title).toBe('finance');
  });
  it('tags of unpublished articles do not leak to viewers', async () => {
    await mk({ title: 'Secret', tags: ['topsecrettag'] }, false);
    expect(hits(await search(c.viewer, 'topsecret'), 'tag')).toHaveLength(0);
    expect(hits(await search(c.editor, 'topsecret'), 'tag')).toHaveLength(1);
  });
  it('respects limit', async () => {
    for (let i = 0; i < 4; i++) await mk({ title: `Lim ${i}` });
    const r = await c.req(c.viewer, 'GET', '/api/search?q=lim&limit=2');
    expect(hits(r, 'article')).toHaveLength(2);
  });

  it('code-shaped queries also return a Codes group (same lookup as the codes page); words do not', async () => {
    const codes = (r: any) => hits(r, 'code');
    expect(codes(await search(c.viewer, 'z0102'))).toEqual([]); // no codes page to open yet
    const page = (await c.req(c.admin, 'POST', '/api/categories', { name: 'Diagnosis & Service codes' })).body;
    expect(codes(await search(c.viewer, 'z0102'))).toEqual([{ id: 'Z01.02|ICD-10-CM', title: 'Z01.02', categoryPath: 'ICD-10-CM', snippet: expect.stringMatching(/vision/i) }]);
    expect(codes(await search(c.viewer, 'Z01.02, 99214')).map((h: any) => h.title)).toEqual(['Z01.02', '99214']);
    expect(codes(await search(c.viewer, 'G0439')).map((h: any) => h.categoryPath)).toEqual(['ICD-10-CM', 'HCPCS']);
    expect(codes(await search(c.viewer, 'office visit'))).toEqual([]);
    expect(codes(await search(c.viewer, 'ZZZ99'))).toEqual([]);
    expect((await c.req(c.admin, 'PATCH', `/api/categories/${page.id}`, { archived: true })).status).toBe(200);
    expect(codes(await search(c.viewer, 'z0102'))).toEqual([]); // archived page: nothing to open
  });
});

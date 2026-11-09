import { gzipSync } from 'node:zlib';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HttpError } from '../api/client';

// A tiny snapshot in the shape scripts/pages/snapshot.ts writes.
const cat = (id: string, name: string, parentId: string | null = null) => ({ id, name, parentId, slug: id, description: `${name} desc`, sortOrder: 0, archived: false, path: name });
const art = (id: string, title: string, categoryId: string, updatedAt: string, type = 'how_to') =>
  ({ id, slug: `${id}-slug`, title, type, status: 'published', categoryId, categoryPath: '', revision: 1, updatedAt, publishedAt: updatedAt, reviewDate: null, ownerId: 'u1' });
const core = {
  categories: [cat('edi', 'EDI & Automation'), cat('edi-101', 'EDI 101', 'edi'), cat('fin', 'Finance'), cat('codes', 'Diagnosis & Service codes')],
  articles: [art('a1', 'Zeta import checks', 'edi-101', '2026-11-03'), art('a2', 'Alpha bank details', 'fin', '2026-11-02'), art('a3', 'Remittance', 'edi', '2026-11-01', 'glossary')],
  counts: [], flows: [{ id: 'f1', slug: 'edi-failed' }],
  articleKeys: { a1: 'a1', 'a1-slug': 'a1', a2: 'a2', a3: 'a3' }, flowKeys: { f1: 'f1', 'edi-failed': 'f1' }, fileNames: { x1: 'x1.svg' },
  search: {
    articles: [
      { id: 'a1', title: 'Zeta import checks', type: 'how_to', body: 'Every invoice passes three import checks in Globo before adjudication.', tags: 'edi', category: 'EDI & Automation / EDI 101', client: '', terms: '', categoryPath: 'EDI & Automation / EDI 101' },
      { id: 'a2', title: 'Alpha bank details', type: 'how_to', body: 'Bank <b> details for Café payments.', tags: '', category: 'Finance', client: '', terms: '', categoryPath: 'Finance' },
      { id: 'a3', title: 'Remittance', type: 'glossary', body: 'An 835 remittance advice explains the import result.', tags: '', category: 'EDI & Automation', client: '', terms: 'ERA', categoryPath: 'EDI & Automation' },
    ],
    flows: [{ slug: 'edi-failed', title: 'EDI claim failed to import', body: 'Does the Member ID exist?' }],
    tags: [{ id: 't1', name: 'edi', articleIds: ['a1'] }],
  },
};
const files: Record<string, unknown> = {
  'demo-data/core.json': core,
  'demo-data/article/a1.json': { article: { id: 'a1', title: 'Zeta import checks' }, files: [], backlinks: [] },
  'demo-data/flow/f1.json': { id: 'f1', title: 'EDI claim failed to import' },
  'demo-data/codes/icd10cm-2027.tsv.gz': gzipSync('Z01\t0\tEncounter for examination of eyes\nZ0102\t1\tFailed vision screening\n'),
  'demo-data/codes/cpt-hcpcs.tsv': '99214\tCPT\tOffice visit\r\n',
};

let demoApi: typeof import('./demoApi').demoApi;
beforeEach(async () => {
  vi.resetModules();
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const f = files[url];
    if (f === undefined) return new Response('', { status: 404 });
    return Buffer.isBuffer(f) ? new Response(new Uint8Array(f)) : new Response(typeof f === 'string' ? f : JSON.stringify(f));
  }));
  ({ demoApi } = await import('./demoApi'));
});
afterEach(() => vi.unstubAllGlobals());

// demoApi is re-imported per test, so its HttpError is a different class from this file's import
const status = (p: Promise<unknown>) => p.then(() => 200, (e) => (e instanceof Error && e.name === 'Error' && 'status' in e ? (e as HttpError).status : -1));

describe('static demo API', () => {
  it('signs everyone in as a viewer', async () => {
    expect(await demoApi('/api/me')).toMatchObject({ user: { role: 'viewer' }, demo: false });
  });

  it('refuses every write and the admin/editor endpoints', async () => {
    expect(await status(demoApi('/api/articles', { method: 'POST', body: '{}' }))).toBe(403);
    expect(await status(demoApi('/api/flows/f1', { method: 'PATCH' }))).toBe(403);
    expect(await status(demoApi('/api/admin/review-due?days=30'))).toBe(403);
    expect(await status(demoApi('/api/tags'))).toBe(403);
  });

  it('lists articles with the server filters, title sort and paging', async () => {
    const all = await demoApi<{ articles: { id: string }[]; total: number }>('/api/articles?limit=2');
    expect(all.articles.map((a) => a.id)).toEqual(['a1', 'a2']);
    expect(all.total).toBe(3);
    const within = await demoApi<{ articles: { id: string }[] }>('/api/articles?within=edi&sort=title&limit=50');
    expect(within.articles.map((a) => a.id)).toEqual(['a3', 'a1']); // descendants included, sorted by title
    expect((await demoApi<{ total: number }>('/api/articles?categoryId=edi&limit=50')).total).toBe(1);
    expect((await demoApi<{ articles: { id: string }[] }>('/api/articles?q=BANK&limit=50')).articles.map((a) => a.id)).toEqual(['a2']);
    expect((await demoApi<{ articles: unknown[] }>('/api/articles?limit=2&offset=2')).articles).toHaveLength(1);
  });

  it('opens articles and flows by id or slug; unknown keys are 404', async () => {
    expect(await demoApi('/api/articles/a1-slug')).toMatchObject({ id: 'a1' });
    expect(await demoApi('/api/articles/a1/files')).toEqual({ files: [] });
    expect(await demoApi('/api/flows/edi-failed')).toMatchObject({ id: 'f1' });
    expect(await status(demoApi('/api/articles/nope'))).toBe(404);
    expect(await status(demoApi('/api/flows/nope'))).toBe(404);
  });

  it('searches with prefix tokens (AND, diacritics ignored), groups like the server and escapes snippets', async () => {
    const groups = await demoApi<{ groups: { kind: string; hits: { id: string; snippet: string }[] }[] }>('/api/search?q=impor%20chec&limit=20');
    expect(groups.groups.map((g) => g.kind)).toEqual(['article']);
    expect(groups.groups[0]!.hits[0]!.snippet).toContain('<mark>import</mark> <mark>checks</mark>');
    const kinds = await demoApi<{ groups: { kind: string; hits: { id: string }[] }[] }>('/api/search?q=import');
    expect(kinds.groups.map((g) => g.kind)).toEqual(['article', 'flow', 'glossary']);
    const cafe = await demoApi<{ groups: { hits: { snippet: string }[] }[] }>('/api/search?q=cafe');
    expect(cafe.groups[0]!.hits[0]!.snippet).toContain('Bank &lt;b&gt;');
    expect(cafe.groups[0]!.hits[0]!.snippet).toContain('<mark>Café</mark>');
    expect((await demoApi<{ groups: { kind: string }[] }>('/api/search?q=edi')).groups.map((g) => g.kind)).toEqual(['article', 'flow', 'category', 'tag', 'glossary']);
  });

  it('looks up codes from the shipped reference files, also from top search', async () => {
    const r = await demoApi<{ results: { query: string; matches: { code: string; billable: boolean }[] }[] }>('/api/codes?q=z01.02%2C%2099214-25');
    expect(r.results.map((x) => [x.query, x.matches.map((m) => m.code)])).toEqual([['Z0102', ['Z01.02']], ['99214', ['99214']], ['25', []]]);
    const s = await demoApi<{ groups: { kind: string; hits: { id: string }[] }[] }>('/api/search?q=z01');
    expect(s.groups.find((g) => g.kind === 'code')!.hits.map((h) => h.id)).toEqual(['Z01|ICD-10-CM']);
  });
});

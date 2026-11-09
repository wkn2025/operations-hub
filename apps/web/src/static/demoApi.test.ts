import { gzipSync } from 'node:zlib';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HttpError } from '../api/client';

// A tiny snapshot in the shape scripts/pages/snapshot.ts writes.
const cat = (id: string, name: string, parentId: string | null = null) => ({ id, name, parentId, slug: id, description: `${name} desc`, sortOrder: 0, archived: false, path: name });
const art = (id: string, title: string, categoryId: string, updatedAt: string, type = 'how_to') =>
  ({ id, slug: `${id}-slug`, title, type, status: 'published', categoryId, categoryPath: '', revision: 1, updatedAt, publishedAt: updatedAt, reviewDate: null, ownerId: 'u1' });
const core = {
  me: { user: { id: 'u1', email: 'admin@demo.test', name: 'Demo Admin', role: 'admin' }, authMode: 'dev', demo: false },
  gets: { '/api/admin/users': { users: [{ id: 'u1' }] }, '/api/admin/review-due?days=30': { articles: [] }, '/api/admin/audit': { entries: [{ id: 2 }], nextCursor: null } },
  categories: [cat('edi', 'EDI & Automation'), cat('edi-101', 'EDI 101', 'edi'), cat('fin', 'Finance'), cat('codes', 'Diagnosis & Service codes')],
  articles: [art('a1', 'Zeta import checks', 'edi-101', '2026-11-03'), art('a2', 'Alpha bank details', 'fin', '2026-11-02'), art('a3', 'Remittance', 'edi', '2026-11-01', 'glossary')],
  counts: [], flows: [{ id: 'f1', slug: 'edi-failed', title: 'EDI claim failed to import', status: 'published', updatedAt: '2026-11-01', articleId: null, article: null, nodeCount: 2, startText: 'Does the Member ID exist?' }],
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
  'demo-data/article/a1.json': { article: { id: 'a1', title: 'Zeta import checks' }, files: [], backlinks: [], revisions: [{ rev: 1 }], revisionDocs: { 1: { rev: 1, title: 'Zeta v1' } } },
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
  it('signs everyone in as the snapshot admin and serves the admin pages from the snapshot', async () => {
    expect(await demoApi('/api/me')).toMatchObject({ user: { role: 'admin' }, demo: false });
    expect(await demoApi('/api/admin/users')).toEqual({ users: [{ id: 'u1' }] });
    expect(await demoApi('/api/admin/review-due?days=30')).toEqual({ articles: [] });
    expect(await demoApi('/api/admin/audit?limit=200')).toEqual({ entries: [{ id: 2 }], nextCursor: null }); // every page in one
    expect(await demoApi('/api/articles/a1/revisions')).toEqual({ revisions: [{ rev: 1 }] });
    expect(await demoApi('/api/articles/a1/revisions/1')).toMatchObject({ title: 'Zeta v1' });
    expect(await status(demoApi('/api/articles/a1/revisions/9'))).toBe(404);
  });

  it('refuses every write as read-only and announces it', async () => {
    const seen = vi.fn();
    window.addEventListener('ops:demo-read-only', seen);
    expect(await status(demoApi('/api/articles', { method: 'POST', body: '{}' }))).toBe(403);
    expect(await demoApi('/api/admin/settings', { method: 'PATCH' }).catch((e: HttpError) => e.body)).toMatchObject({ error: 'read_only' });
    expect(seen).toHaveBeenCalledTimes(2);
    window.removeEventListener('ops:demo-read-only', seen);
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

  it('lets a visitor create, build, publish and find a guided flow for the visit, with the server rules', async () => {
    const json = (method: string, body: unknown) => ({ method, json: body }) as RequestInit;
    const f = await demoApi<{ id: string; slug: string; revision: number; status: string; validation: { ok: boolean } }>('/api/flows',
      json('POST', { title: 'Printer offline', startId: 'q1', nodes: [{ id: 'q1', kind: 'question', text: '' }] }));
    expect(f).toMatchObject({ slug: 'printer-offline', revision: 1, status: 'draft', validation: { ok: false } }); // drafts may be unfinished
    expect(await status(demoApi(`/api/flows/${f.id}/publish`, { method: 'POST' }))).toBe(422); // not while incomplete
    const nodes = [
      { id: 'q1', kind: 'question', text: 'Is it plugged in?', options: [{ label: 'Yes', to: 'r1' }, { label: 'No', to: 'r2' }] },
      { id: 'r1', kind: 'result', text: 'Call IT', severity: 'warning' }, { id: 'r2', kind: 'result', text: 'Plug it in', severity: 'success' },
    ];
    expect(await status(demoApi(`/api/flows/${f.id}`, json('PATCH', { baseRevision: 9, nodes })))).toBe(409);
    expect(await status(demoApi(`/api/flows/${f.id}`, json('PATCH', { baseRevision: 1, nodes: [{ id: 'q1', kind: 'question', text: 'x', options: [{ label: 'a', to: 'nowhere' }] }] })))).toBe(422);
    const saved = await demoApi<{ revision: number }>(`/api/flows/${f.id}`, json('PATCH', { baseRevision: 1, nodes, autosave: true }));
    expect(saved.revision).toBe(2);
    expect(await demoApi(`/api/flows/${f.id}/publish`, { method: 'POST' })).toMatchObject({ status: 'published', revision: 3 });
    const list = await demoApi<{ flows: { slug: string; nodeCount: number }[] }>('/api/flows');
    expect(list.flows[0]).toMatchObject({ slug: 'printer-offline', nodeCount: 3 }); // newest first, next to the snapshot ones
    expect(list.flows).toHaveLength(2);
    expect(await demoApi('/api/flows/printer-offline')).toMatchObject({ id: f.id });
    const hits = await demoApi<{ groups: { kind: string; hits: { id: string }[] }[] }>('/api/search?q=plugged');
    expect(hits.groups.find((g) => g.kind === 'flow')!.hits.map((h) => h.id)).toEqual(['printer-offline']);
    expect(await status(demoApi('/api/flows', json('POST', { title: '' })))).toBe(400);
  });
});

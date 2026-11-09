import { splitCodes } from '@ops/shared';
import { demoFileNames, READ_ONLY_EVENT } from './demo';
import { changedFlowIndex, flowRequest, type FlowSource } from './demoFlows';
import { HttpError, type Article, type FlowSummary, type FlowView, type ArticleSummary, type Category, type FileRef, type SearchGroup, type SearchHit } from '../api/client';

/** The static (GitHub Pages) stand-in for the API: answers GET requests from the snapshot written by scripts/pages/snapshot.ts
 * (taken as the seeded admin), mirroring the server (same filters, paging, search groups, code lookup). Guided flows can be
 * created and edited for the visit (demoFlows.ts); every other write is refused and announced with a READ_ONLY_EVENT so the
 * shell can say why. */

interface IndexRow { id: string; title: string; type: string; body: string; tags: string; category: string; client: string; terms: string; categoryPath: string }
interface Core {
  me: { user: { role: string } | null }; gets: Record<string, unknown>;
  categories: Category[]; articles: (ArticleSummary & { ownerId?: string | null })[]; counts: unknown[]; flows: FlowSummary[];
  articleKeys: Record<string, string>; flowKeys: Record<string, string>; fileNames: Record<string, string>;
  search: { articles: IndexRow[]; flows: { slug: string; title: string; body: string }[]; tags: { id: string; name: string; articleIds: string[] }[] };
}

const DATA = 'demo-data/';
const json = async <T>(path: string): Promise<T> => {
  const res = await fetch(DATA + path);
  if (!res.ok) throw new HttpError(res.status === 404 ? 404 : 500, { error: res.status === 404 ? 'not_found' : 'internal' });
  return res.json() as Promise<T>;
};
let core: Promise<Core> | undefined;
const getCore = () => (core ??= json<Core>('core.json').then((c) => {
  for (const [id, name] of Object.entries(c.fileNames)) demoFileNames.set(id, name);
  return c;
}).catch((e) => { core = undefined; throw e; }));
interface ArticleFile { article: Article; files: FileRef[]; backlinks: ArticleSummary[]; revisions: unknown[]; revisionDocs: Record<string, unknown> }
const articleFile = new Map<string, Promise<ArticleFile>>();
const loadArticle = (id: string) => {
  let p = articleFile.get(id);
  if (!p) { p = json(`article/${id}.json`); articleFile.set(id, p); p.catch(() => articleFile.delete(id)); }
  return p;
};

const notFound = () => new HttpError(404, { error: 'not_found' });
const forbidden = () => new HttpError(403, { error: 'forbidden' });

export { READ_ONLY_EVENT } from './demo';

export async function demoApi<T>(path: string, init?: RequestInit): Promise<T> {
  const method = (init?.method ?? 'GET').toUpperCase();
  const url = new URL(path, 'https://demo.invalid');
  const p = url.pathname, q = url.searchParams;
  const parts = p.split('/').filter(Boolean).map(decodeURIComponent); // ['api', ...]
  if (parts[0] === 'api' && parts[1] === 'flows') {
    const c = await getCore();
    const src: FlowSource = { articles: c.articles, flows: c.flows, load: (id) => json<FlowView>(`flow/${id}.json`) };
    const body = (init as { json?: unknown } | undefined)?.json ?? (typeof init?.body === 'string' ? JSON.parse(init.body) : undefined);
    const res = await flowRequest(src, method, parts.slice(2), body);
    if (res !== null) return res as T;
  }
  if (method !== 'GET') {
    if (typeof window !== 'undefined') window.dispatchEvent(new Event(READ_ONLY_EVENT));
    throw new HttpError(403, { error: 'read_only', message: 'This is a read-only demo; changes are not saved.' });
  }
  if (parts[0] !== 'api') throw notFound();
  const r = parts.slice(1);
  const c = await getCore();

  if (p === '/api/me') return c.me as T;
  const fixed = c.gets[p + url.search] ?? c.gets[p];
  if (fixed !== undefined) return fixed as T;
  if (p === '/api/categories') return { categories: c.categories } as T;
  if (p === '/api/articles') return listArticles(c, q) as T;
  if (p === '/api/articles/counts') return { counts: c.counts } as T;
  if (p === '/api/search') return { groups: await search(c, q.get('q') ?? '', Number(q.get('limit')) || 20) } as T;
  if (p === '/api/codes') {
    const term = q.get('q') ?? '';
    if (term.length > 2000) throw new HttpError(400, { error: 'invalid' });
    if (splitCodes(term).length > 100) throw new HttpError(400, { error: 'too_many_codes', max: 100 });
    return { results: await lookupCodes(term) } as T;
  }
  if (r[0] === 'articles' && r[1]) {
    const id = c.articleKeys[r[1]];
    if (!id) throw notFound();
    const a = await loadArticle(id);
    if (r.length === 2) return a.article as T;
    if (r.length === 3 && r[2] === 'files') return { files: a.files } as T;
    if (r.length === 3 && r[2] === 'backlinks') return { backlinks: a.backlinks } as T;
    if (r.length === 3 && r[2] === 'revisions') return { revisions: a.revisions } as T;
    if (r.length === 4 && r[2] === 'revisions' && a.revisionDocs[r[3]!]) return a.revisionDocs[r[3]!] as T;
    throw notFound();
  }
  if (r[0] === 'auth') throw forbidden();
  throw notFound();
}

// ---- GET /api/articles: same filters, order and paging as services/articles.ts listArticles/countArticles ----
function listArticles(c: Core, q: URLSearchParams) {
  const status = q.get('status'), categoryId = q.get('categoryId'), type = q.get('type'), within = q.get('within'), ownerId = q.get('ownerId'), title = q.get('q');
  const limit = Math.min(200, Math.max(1, Number(q.get('limit')) || 50)), offset = Math.max(0, Number(q.get('offset')) || 0);
  let ids: Set<string> | undefined;
  if (within) {
    ids = new Set([within]);
    for (let grew = true; grew;) { grew = false; for (const x of c.categories) if (x.parentId && ids.has(x.parentId) && !ids.has(x.id)) { ids.add(x.id); grew = true; } }
  }
  const rows = c.articles.filter((a) =>
    (!status || a.status === status) && (!categoryId || a.categoryId === categoryId) && (!type || a.type === type)
    && (!ids || (a.categoryId != null && ids.has(a.categoryId)))
    && (!ownerId || (ownerId === 'none' ? a.ownerId == null : a.ownerId === ownerId))
    && (!title || a.title.toLowerCase().includes(title.toLowerCase())));
  if (q.get('sort') === 'title') rows.sort((x, y) => cmp(x.title.toLowerCase(), y.title.toLowerCase()) || cmp(x.id, y.id));
  // snapshot is already in the server's default order (updated_at desc, id)
  return { articles: rows.slice(offset, offset + limit), total: rows.length };
}
const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

// ---- search: an in-browser take on the FTS5 query (quoted prefix tokens, AND, diacritics ignored, title weighted) ----
const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const words = (s: string) => [...s.matchAll(/[\p{L}\p{N}]+/gu)];

/** Count of words in `text` starting with each token; null when some token is missing. */
function hits(text: string, tokens: string[]) {
  const ws = words(fold(text)).map((m) => m[0]);
  let n = 0;
  for (const t of tokens) { const k = ws.filter((w) => w.startsWith(t)).length; n += k; }
  return n;
}
/** ~14 words around the first match, matches wrapped in <mark>, everything else HTML-escaped (like snippet(…, '…', 14)). */
function snippet(text: string, tokens: string[]) {
  const ms = words(text);
  const isHit = (w: string) => { const f = fold(w); return tokens.some((t) => f.startsWith(t)); };
  const first = Math.max(0, ms.findIndex((m) => isHit(m[0])));
  const start = Math.max(0, first - 4), end = Math.min(ms.length, start + 14);
  if (!ms.length) return '';
  let out = start > 0 ? '…' : '', pos = ms[start]!.index!;
  for (let i = start; i < end; i++) {
    const m = ms[i]!;
    out += esc(text.slice(pos, m.index!));
    out += isHit(m[0]) ? `<mark>${esc(m[0])}</mark>` : esc(m[0]);
    pos = m.index! + m[0].length;
  }
  return out + (end < ms.length ? '…' : '');
}

async function search(c: Core, q: string, limit: number): Promise<SearchGroup[]> {
  const tokens = (q.slice(0, 200).match(/[\p{L}\p{N}]+/gu) ?? []).slice(0, 8).map(fold);
  if (!tokens.length) return [];
  const all = (s: string) => { const f = words(fold(s)).map((m) => m[0]); return tokens.every((t) => f.some((w) => w.startsWith(t))); };
  const groups: SearchGroup[] = [];

  // bm25 weights from services/search.ts: title 10, body 1, tags 3, category 2, client 3, terms 3
  const scored = c.search.articles
    .filter((a) => all([a.title, a.body, a.tags, a.category, a.client, a.terms].join(' ')))
    .map((a) => ({ a, score: 10 * hits(a.title, tokens) + hits(a.body, tokens) + 3 * hits(a.tags, tokens) + 2 * hits(a.category, tokens) + 3 * hits(a.client, tokens) + 3 * hits(a.terms, tokens) }))
    .sort((x, y) => y.score - x.score).slice(0, limit);
  const toHit = ({ a }: (typeof scored)[number]): SearchHit => {
    const col = [a.body, a.title, a.terms, a.client, a.tags].find((t) => hits(t, tokens) > 0) ?? a.title;
    return { id: a.id, title: a.title, categoryPath: a.categoryPath, snippet: snippet(col, tokens) };
  };
  const art = scored.filter((s) => s.a.type !== 'glossary').map(toHit), glo = scored.filter((s) => s.a.type === 'glossary').map(toHit);
  if (art.length) groups.push({ kind: 'article', hits: art });

  // flows changed this visit replace their snapshot rows
  const own = changedFlowIndex(), ownIds = new Set(own.map((f) => f.id));
  const flowRows = [...c.search.flows.filter((f) => !ownIds.has(c.flows.find((x) => x.slug === f.slug)?.id ?? '')), ...own];
  const flows = flowRows.filter((f) => all(`${f.title} ${f.body}`))
    .sort((x, y) => (10 * hits(y.title, tokens) + hits(y.body, tokens)) - (10 * hits(x.title, tokens) + hits(x.body, tokens))).slice(0, limit);
  if (flows.length) groups.push({ kind: 'flow', hits: flows.map((f) => ({ id: f.slug, title: f.title, categoryPath: 'Guided flow', snippet: snippet(hits(f.body, tokens) ? f.body : f.title, tokens) })) });

  // services/articles.ts hiddenCategoryIds: only viewers lose archived categories (and their children)
  const byId = new Map(c.categories.map((x) => [x.id, x]));
  const archived = (x: Category | undefined): boolean => !!x && (x.archived || archived(x.parentId ? byId.get(x.parentId) : undefined));
  const visible = c.me.user?.role === 'viewer' ? c.categories.filter((x) => !archived(x)) : c.categories;
  const cats = visible.filter((x) => tokens.every((t) => fold(x.name).includes(t))).slice(0, limit)
    .map((x) => ({ id: x.id, title: x.name, snippet: esc(x.description ?? ''), categoryPath: x.parentId ? (c.categories.find((p) => p.id === x.parentId)?.path ?? '') : '' }));
  if (cats.length) groups.push({ kind: 'category', hits: cats });

  const tags = c.search.tags.filter((t) => tokens.every((k) => fold(t.name).includes(k))).sort((x, y) => y.articleIds.length - x.articleIds.length).slice(0, limit);
  if (tags.length) groups.push({ kind: 'tag', hits: tags.map((t) => ({ id: t.id, title: t.name, snippet: `${t.articleIds.length} article${t.articleIds.length === 1 ? '' : 's'}`, categoryPath: '' })) });
  if (glo.length) groups.push({ kind: 'glossary', hits: glo });

  const codesPage = visible.some((x) => !x.parentId && x.name === 'Diagnosis & Service codes');
  const ws = splitCodes(q.slice(0, 200)).slice(0, 10);
  if (codesPage && ws.length && ws.every((w) => /\d/.test(w) && w.length <= 7)) {
    const codeHits = (await lookupCodes(ws.join(' '))).flatMap((r) => r.matches).map((m) => ({
      id: `${m.code}|${m.system}`, title: m.code, categoryPath: m.system, snippet: esc(m.description + (m.billable ? '' : ' (category, not billable)')),
    }));
    if (codeHits.length) groups.push({ kind: 'code', hits: codeHits });
  }
  return groups;
}

// ---- codes: the same reference files and parsing as apps/server/src/services/codes.ts ----
interface CodeMatch { system: string; code: string; billable: boolean; description: string }
let codeIndex: Promise<Map<string, CodeMatch[]>> | undefined;

async function text(path: string) {
  const res = await fetch(DATA + path);
  if (!res.ok) throw new HttpError(500, { error: 'internal' });
  const buf = new Uint8Array(await res.arrayBuffer());
  if (buf[0] !== 0x1f || buf[1] !== 0x8b) return new TextDecoder().decode(buf); // the host may already have un-gzipped it
  return new Response(new Response(buf).body!.pipeThrough(new DecompressionStream('gzip'))).text();
}
function loadCodes() {
  return (codeIndex ??= (async () => {
    const m = new Map<string, CodeMatch[]>();
    const add = (k: string, x: CodeMatch) => { const l = m.get(k); if (l) l.push(x); else m.set(k, [x]); };
    const [icd, cpt] = await Promise.all([text('codes/icd10cm-2027.tsv.gz'), text('codes/cpt-hcpcs.tsv')]);
    for (const line of icd.split(/\r?\n/)) {
      const [code, flag, description] = line.split('\t');
      if (code && description) add(code, { system: 'ICD-10-CM', code: code.length > 3 ? `${code.slice(0, 3)}.${code.slice(3)}` : code, billable: flag === '1', description });
    }
    for (const line of cpt.split(/\r?\n/)) {
      const [code, system, description] = line.split('\t');
      if (code && system && description) add(code, { system, code, billable: true, description });
    }
    return m;
  })().catch((e) => { codeIndex = undefined; throw e; }));
}
async function lookupCodes(q: string) {
  const m = await loadCodes();
  return splitCodes(q).map((query) => ({ query, matches: m.get(query) ?? [] }));
}

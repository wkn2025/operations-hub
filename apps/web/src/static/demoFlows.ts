import { flowCreateBody, flowPatchBody, INCOMPLETE_CODES, validateFlow, type ArticleStatus, type Flow, type FlowNode, type FlowValidation } from '@ops/shared';
import { HttpError, type ArticleSummary, type FlowSummary, type FlowView } from '../api/client';

/** Guided flows in the static (Pages) demo: the one thing visitors may change (user ruling 2026-11-09: "create a guided flow to
 * demonstrate this tool"). Same rules as apps/server/src/services/flows.ts (validation, statuses, revisions, slugs), kept in
 * memory only: a reload brings back the snapshot. The visitor is the admin, so every permission is granted. */

export interface FlowSource {
  articles: ArticleSummary[];
  flows: FlowSummary[];
  load: (id: string) => Promise<FlowView>; // a snapshot flow
}

const changed = new Map<string, FlowView>(); // created or edited this visit, by id
const ALL = { write: true, publish: true, submit: true, archive: true };

type Parsed<T> = { success: true; data: T } | { success: false; error: { issues: { path: (string | number)[]; message: string }[] } };
const parse = <T>(r: Parsed<T>): T => {
  if (!r.success) throw new HttpError(400, { error: 'invalid', issues: r.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) });
  return r.data;
};
const slugify = (s: string) =>
  s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'item';

function all(src: FlowSource): FlowSummary[] {
  const byId = new Map(src.flows.map((f) => [f.id, f]));
  for (const v of changed.values()) byId.set(v.id, summary(v));
  return [...byId.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
function uniqueSlug(src: FlowSource, title: string, excludeId?: string) {
  const taken = new Set(all(src).filter((f) => f.id !== excludeId).map((f) => f.slug));
  const base = slugify(title);
  for (let i = 1; ; i++) { const s = i === 1 ? base : `${base}-${i}`; if (!taken.has(s)) return s; }
}
const summary = (v: FlowView): FlowSummary => ({
  id: v.id, slug: v.slug, title: v.title, status: v.status, updatedAt: v.updatedAt, articleId: v.articleId, article: v.article,
  nodeCount: v.nodes.length, startText: v.nodes.find((n) => n.id === v.startId)?.text ?? '',
});

function validation(src: FlowSource, f: Flow): FlowValidation {
  const v = validateFlow(f);
  for (const n of f.nodes) {
    if (n.articleId && !src.articles.some((a) => a.id === n.articleId)) {
      const message = `The article linked from "${n.text.slice(0, 40) || n.id}" no longer exists.`;
      v.issues.push({ level: 'error', code: 'missing_article', nodeId: n.id, message });
      v.errors.push(message);
      v.ok = false;
    }
  }
  return v;
}
/** Drafts may stay unfinished; integrity errors always block; a live flow must be fully valid (services/flows.ts checkWrite). */
function checkWrite(src: FlowSource, f: Flow, status: ArticleStatus) {
  const blocking = validation(src, f).issues.filter((i) => i.level === 'error' && (status === 'published' || !INCOMPLETE_CODES.includes(i.code)));
  if (blocking.length) throw new HttpError(422, { error: 'invalid_flow', errors: blocking.map((i) => i.message), issues: blocking });
}
function articleRef(src: FlowSource, id: string | null | undefined) {
  const a = id ? src.articles.find((x) => x.id === id) : undefined;
  return a ? { id: a.id, slug: a.slug, title: a.title } : null;
}
function view(src: FlowSource, v: Omit<FlowView, 'articles' | 'article' | 'validation' | 'permissions'>): FlowView {
  const articles: FlowView['articles'] = {};
  for (const n of v.nodes) if (n.articleId && !(n.articleId in articles)) {
    const a = src.articles.find((x) => x.id === n.articleId);
    articles[n.articleId] = a ? { status: a.status, title: a.title, slug: a.slug } : { status: 'unavailable' };
  }
  return { ...v, article: articleRef(src, v.articleId), articles, permissions: ALL, validation: validation(src, v) };
}

async function find(src: FlowSource, key: string): Promise<FlowView> {
  const own = changed.get(key) ?? [...changed.values()].find((v) => v.slug === key);
  if (own) return own;
  const s = src.flows.find((f) => f.id === key || f.slug === key);
  if (!s || changed.has(s.id)) throw new HttpError(404, { error: 'not_found' }); // a renamed flow answers to its new slug only
  return src.load(s.id);
}
const remember = (v: FlowView) => { changed.set(v.id, v); return v; };

const TRANSITIONS = {
  submit: { from: ['draft'], to: 'in_review' },
  publish: { from: ['draft', 'in_review'], to: 'published' },
  archive: { from: ['draft', 'in_review', 'published'], to: 'archived' },
  restore: { from: ['archived'], to: 'draft' },
} as const;

/** Answers /api/flows requests; null when the path is not a flow route. */
export async function flowRequest(src: FlowSource, method: string, parts: string[], body: unknown): Promise<unknown | null> {
  const [key, action] = parts;
  if (method === 'GET' && !key) return { flows: all(src) };
  if (method === 'GET' && key && !action) return find(src, key);
  if (method === 'POST' && !key) {
    const b = parse(flowCreateBody.safeParse(body));
    const nodes: FlowNode[] = b.nodes ?? [], startId = b.startId ?? nodes[0]?.id ?? '';
    if (b.articleId && !articleRef(src, b.articleId)) throw new HttpError(400, { error: 'invalid', message: 'unknown articleId' });
    checkWrite(src, { title: b.title, startId, nodes }, 'draft');
    const now = new Date().toISOString(), id = crypto.randomUUID();
    return remember(view(src, { id, slug: uniqueSlug(src, b.title), title: b.title, status: 'draft', revision: 1, startId, articleId: b.articleId ?? null, nodes, updatedAt: now, publishedAt: null }));
  }
  if (method === 'PATCH' && key && !action) {
    const b = parse(flowPatchBody.safeParse(body));
    const cur = await find(src, key);
    if (cur.revision !== b.baseRevision) throw new HttpError(409, { error: 'conflict', current: { revision: cur.revision, updatedAt: cur.updatedAt } });
    if (b.articleId !== undefined && b.articleId !== cur.articleId && b.articleId && !articleRef(src, b.articleId)) throw new HttpError(400, { error: 'invalid', message: 'unknown articleId' });
    const title = b.title ?? cur.title, nodes = b.nodes ?? cur.nodes, startId = b.startId ?? cur.startId;
    checkWrite(src, { title, startId, nodes }, cur.status);
    return remember(view(src, {
      ...cur, title, nodes, startId, articleId: b.articleId === undefined ? cur.articleId : b.articleId, revision: cur.revision + 1, updatedAt: new Date().toISOString(),
      slug: !cur.publishedAt && title !== cur.title ? uniqueSlug(src, title, cur.id) : cur.slug, // stable once published
    }));
  }
  if (method === 'POST' && key && action && action in TRANSITIONS) {
    const cur = await find(src, key), t = TRANSITIONS[action as keyof typeof TRANSITIONS];
    if (!(t.from as readonly string[]).includes(cur.status)) throw new HttpError(409, { error: 'invalid_transition', status: cur.status });
    if (action === 'publish' || action === 'submit') checkWrite(src, cur, 'published');
    const now = new Date().toISOString();
    return remember(view(src, { ...cur, status: t.to, revision: cur.revision + 1, updatedAt: now, publishedAt: action === 'publish' ? (cur.publishedAt ?? now) : cur.publishedAt }));
  }
  return null;
}

/** Search rows for flows changed this visit (title + node text, detail, answer labels, like indexFlow). */
export const changedFlowIndex = () => [...changed.values()].map((v) => ({
  id: v.id, slug: v.slug, title: v.title, body: v.nodes.flatMap((n) => [n.text, n.detail ?? '', ...(n.options ?? []).map((o) => o.label)]).join(' '),
}));

/** Tests only. */
export const resetDemoFlows = () => changed.clear();

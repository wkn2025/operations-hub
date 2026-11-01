import type { Database } from 'better-sqlite3';
import { eq } from 'drizzle-orm';
import { ARTICLE_STATUSES, INCOMPLETE_CODES, validateFlow, type ArticleStatus, type Flow, type FlowNode, type FlowValidation, type User } from '@ops/shared';
import { articles, flows } from '../db/schema';
import { can } from '../auth/policy';
import { audit } from './audit';
import { ApiError, notFound, readable, requireApproval, uniqueSlug, type Svc } from './articles';

type FlowRow = typeof flows.$inferSelect;

/** The one visibility rule for flows (list, get and search all use it): statuses the user may read per can('flow:read'). */
export const readableStatuses = (user: User): ArticleStatus[] => ARTICLE_STATUSES.filter((st) => can(user, 'flow:read', { status: st }));
/** SQL predicate over alias `alias` derived from readableStatuses. */
export const flowVisibilitySql = (user: User, alias = 'f') => `${alias}.status in (${readableStatuses(user).map((st) => "'" + st + "'").join(',') || "''"})`;

const nodesOf = (row: FlowRow): FlowNode[] => { try { return JSON.parse(row.nodes) as FlowNode[]; } catch { return []; } };

/** Row if the user may read it (viewers: published only), else null -> callers answer 404. */
export function readableFlow(s: Svc, user: User, key: string): FlowRow | null {
  const row = s.db.select().from(flows).where(eq(flows.id, key)).get()
    ?? s.db.select().from(flows).where(eq(flows.slug, key)).get();
  return row && can(user, 'flow:read', { status: row.status }) ? row : null;
}

/** validateFlow plus the checks that need the database: referenced articles must exist. */
export function fullValidation(s: Svc, f: Flow): FlowValidation {
  const v = validateFlow(f);
  for (const n of Array.isArray(f.nodes) ? f.nodes : []) {
    if (n.kind === 'article' && n.articleId && !s.db.select({ id: articles.id }).from(articles).where(eq(articles.id, n.articleId)).get()) {
      const message = `The article linked from "${n.text.slice(0, 40) || n.id}" no longer exists.`;
      v.issues.push({ level: 'error', code: 'missing_article', nodeId: n.id, message });
      v.errors.push(message);
      v.ok = false;
    }
  }
  return v;
}

/** Search text: title + every node's text, detail and answer labels. */
export function indexFlow(sqlite: Database, id: string) {
  const row = sqlite.prepare('select id, title, nodes from flows where id = ?').get(id) as { id: string; title: string; nodes: string } | undefined;
  sqlite.prepare('delete from flow_fts where flow_id = ?').run(id);
  if (!row) return;
  let nodes: FlowNode[] = [];
  try { nodes = JSON.parse(row.nodes); } catch { /* indexed by title only */ }
  const body = nodes.flatMap((n) => [n.text, n.detail ?? '', ...(n.options ?? []).map((o) => o.label)]).join(' ').replace(/[\x00-\x1f]/g, ' ');
  sqlite.prepare('insert into flow_fts(title, body, flow_id) values (?,?,?)').run(row.title.replace(/[\x00-\x1f]/g, ' '), body, id);
}

export function flowView(s: Svc, row: FlowRow, user: User) {
  const nodes = nodesOf(row);
  const art = (id: string) => {
    const a = readable(s, user, id);
    return a ? { status: a.status, title: a.title, slug: a.slug } : { status: 'unavailable' as const };
  };
  const articlesMap = new Map<string, ReturnType<typeof art>>(); // Map: ids like __proto__ stay plain keys
  for (const n of nodes) if (n.articleId && !articlesMap.has(n.articleId)) articlesMap.set(n.articleId, art(n.articleId));
  const linked = row.articleId ? readable(s, user, row.articleId) : null;
  const res = { status: row.status }, opts = { requireApproval: requireApproval(s.sqlite) };
  const writer = user.role !== 'viewer';
  return {
    id: row.id, slug: row.slug, title: row.title, status: row.status, revision: row.revision, startId: row.startId ?? '',
    articleId: row.articleId, article: linked ? { id: linked.id, slug: linked.slug, title: linked.title } : null,
    nodes, articles: Object.fromEntries(articlesMap), updatedAt: row.updatedAt, publishedAt: row.publishedAt,
    permissions: {
      write: can(user, 'flow:write', res, opts), publish: can(user, 'flow:publish', res, opts),
      submit: can(user, 'flow:submit', res, opts), archive: can(user, 'flow:archive', res, opts),
    },
    ...(writer ? { validation: fullValidation(s, { title: row.title, startId: row.startId ?? '', nodes }) } : {}),
  };
}

export function listFlows(s: Svc, user: User) {
  const rows = s.db.select().from(flows).all().filter((r) => can(user, 'flow:read', { status: r.status }));
  return rows.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map((r) => {
    const nodes = nodesOf(r);
    const linked = r.articleId ? readable(s, user, r.articleId) : null;
    return {
      id: r.id, slug: r.slug, title: r.title, status: r.status, updatedAt: r.updatedAt, articleId: r.articleId,
      article: linked ? { id: linked.id, slug: linked.slug, title: linked.title } : null,
      nodeCount: nodes.length, startText: nodes.find((n) => n.id === r.startId)?.text ?? '',
    };
  });
}

/**
 * Drafts may be saved unfinished (the editor autosaves mid-edit): "incomplete" errors are kept and shown.
 * Integrity errors (unknown targets, duplicate ids, loops without an exit) are rejected on every write,
 * and a flow that is live (published) must be fully valid.
 */
function checkWrite(s: Svc, f: Flow, status: ArticleStatus) {
  const v = fullValidation(s, f);
  const blocking = v.issues.filter((i) => i.level === 'error' && (status === 'published' || !INCOMPLETE_CODES.includes(i.code)));
  if (blocking.length) throw new ApiError(422, { error: 'invalid_flow', errors: blocking.map((i) => i.message), issues: blocking });
}

function checkArticleLink(s: Svc, id: string | null | undefined) {
  if (id && !s.db.select({ id: articles.id }).from(articles).where(eq(articles.id, id)).get()) throw new ApiError(400, { error: 'invalid', message: 'unknown articleId' });
}

export function createFlow(s: Svc, user: User, b: { title: string; nodes?: FlowNode[]; startId?: string; articleId?: string | null }) {
  if (!can(user, 'flow:write', {})) throw new ApiError(403, { error: 'forbidden' });
  return s.sqlite.transaction(() => {
    checkArticleLink(s, b.articleId);
    const nodes = b.nodes ?? [], startId = b.startId ?? nodes[0]?.id ?? '';
    checkWrite(s, { title: b.title, startId, nodes }, 'draft');
    const id = crypto.randomUUID(), now = new Date().toISOString();
    s.db.insert(flows).values({
      id, slug: uniqueSlug(s.sqlite, 'flows', b.title), title: b.title, articleId: b.articleId ?? null, nodes: JSON.stringify(nodes),
      startId, status: 'draft', revision: 1, createdBy: user.id, createdAt: now, updatedAt: now,
    }).run();
    indexFlow(s.sqlite, id);
    audit(s.db, { actorId: user.id, action: 'flow.create', entity: 'flow', entityId: id, summary: `Created flow "${b.title}"` });
    return id;
  })();
}

export function updateFlow(s: Svc, user: User, key: string, b: { baseRevision: number; title?: string; nodes?: FlowNode[]; startId?: string; articleId?: string | null; autosave?: boolean }) {
  return s.sqlite.transaction(() => {
    const cur = readableFlow(s, user, key);
    if (!cur) throw notFound();
    if (!can(user, 'flow:write', { status: cur.status }, { requireApproval: requireApproval(s.sqlite) })) throw new ApiError(403, { error: 'forbidden' });
    if (cur.revision !== b.baseRevision) throw new ApiError(409, { error: 'conflict', current: { revision: cur.revision, updatedAt: cur.updatedAt } });
    if (b.articleId !== undefined && b.articleId !== cur.articleId) checkArticleLink(s, b.articleId);
    const title = b.title ?? cur.title, nodes = b.nodes ?? nodesOf(cur), startId = b.startId ?? cur.startId ?? '';
    checkWrite(s, { title, startId, nodes }, cur.status);
    const now = new Date().toISOString(), revision = cur.revision + 1;
    s.db.update(flows).set({
      title, nodes: JSON.stringify(nodes), startId, articleId: b.articleId === undefined ? cur.articleId : b.articleId, revision, updatedAt: now,
      slug: !cur.publishedAt && title !== cur.title ? uniqueSlug(s.sqlite, 'flows', title, cur.id) : cur.slug, // stable once published
    }).where(eq(flows.id, cur.id)).run();
    indexFlow(s.sqlite, cur.id);
    const entry = { actorId: user.id, action: 'flow.update', entity: 'flow', entityId: cur.id, summary: `Saved flow "${title}" (version ${revision})` };
    // autosaves by the same author within 10 min share one audit row (like articles share one revision)
    const last = b.autosave ? s.sqlite.prepare("select id, actor_id, action, created_at from audit_log where entity = 'flow' and entity_id = ? order by id desc limit 1").get(cur.id) as { id: number; actor_id: string; action: string; created_at: string } | undefined : undefined;
    if (last && last.action === 'flow.update' && last.actor_id === user.id && Date.now() - Date.parse(last.created_at) < 10 * 60_000) {
      s.sqlite.prepare('update audit_log set detail = ? where id = ?').run(JSON.stringify({ summary: entry.summary }), last.id);
    } else audit(s.db, entry);
    return cur.id;
  })();
}

const TRANSITIONS = {
  submit: { from: ['draft'], to: 'in_review', perm: 'flow:submit' },
  publish: { from: ['draft', 'in_review'], to: 'published', perm: 'flow:publish' },
  archive: { from: ['draft', 'in_review', 'published'], to: 'archived', perm: 'flow:archive' },
  restore: { from: ['archived'], to: 'draft', perm: 'flow:archive' },
} as const;
export type FlowTransition = keyof typeof TRANSITIONS;

export function transitionFlow(s: Svc, user: User, key: string, action: FlowTransition) {
  return s.sqlite.transaction(() => {
    const cur = readableFlow(s, user, key);
    if (!cur) throw notFound();
    const t = TRANSITIONS[action];
    if (!can(user, t.perm, { status: cur.status }, { requireApproval: requireApproval(s.sqlite) })) throw new ApiError(403, { error: 'forbidden' });
    if (!(t.from as readonly string[]).includes(cur.status)) throw new ApiError(409, { error: 'invalid_transition', status: cur.status });
    if (action === 'publish' || action === 'submit') checkWrite(s, { title: cur.title, startId: cur.startId ?? '', nodes: nodesOf(cur) }, 'published');
    const now = new Date().toISOString();
    s.db.update(flows).set({ status: t.to, updatedAt: now, revision: cur.revision + 1, publishedAt: action === 'publish' ? (cur.publishedAt ?? now) : cur.publishedAt }).where(eq(flows.id, cur.id)).run();
    indexFlow(s.sqlite, cur.id);
    audit(s.db, { actorId: user.id, action: `flow.${action}`, entity: 'flow', entityId: cur.id, summary: `${action}: flow "${cur.title}" ${cur.status} -> ${t.to}` });
    return cur.id;
  })();
}

import type { Database } from 'better-sqlite3';
import type { User } from '@ops/shared';
import { flowVisibilitySql } from './flows';
import { categoryPath, hiddenCategoryIds, visibility, type Svc } from './articles';

/** Rebuild the FTS row for one article. Call inside the same transaction as the save. */
export function indexArticle(sqlite: Database, articleId: string) {
  const a = sqlite.prepare('select id, title, content_text, fields, category_id from articles where id = ?').get(articleId) as
    { id: string; title: string; content_text: string; fields: string; category_id: string | null } | undefined;
  sqlite.prepare('delete from article_fts where article_id = ?').run(articleId);
  if (!a) return;
  const tags = (sqlite.prepare('select t.name from article_tags at join tags t on t.id = at.tag_id where at.article_id = ?').all(articleId) as { name: string }[]).map((t) => t.name).join(' ');
  let f: Record<string, unknown> = {};
  try { f = JSON.parse(a.fields) ?? {}; } catch { /* ignore */ }
  const str = (v: unknown) => (Array.isArray(v) ? v.join(' ') : typeof v === 'string' ? v : '');
  const terms = [f.term, f.terms, f.acronym, f.aliases].map(str).join(' ').trim();
  const cats = sqlite.prepare('select id, parent_id as parentId, name from categories').all() as { id: string; parentId: string | null; name: string }[];
  const clean = (v: string) => v.replace(/[\x00-\x1f]/g, ' ');
  sqlite.prepare('insert into article_fts(title, body, tags, category, client, terms, article_id) values (?,?,?,?,?,?,?)')
    .run(clean(a.title), a.content_text, clean(tags), a.category_id ? clean(categoryPath(cats, a.category_id)) : '', clean(str(f.client)), clean(terms), a.id);
}

export interface Hit { id: string; title: string; snippet: string; categoryPath: string }
export interface Group { kind: 'article' | 'flow' | 'category' | 'tag' | 'glossary'; hits: Hit[] }

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** User text -> quoted prefix tokens joined by implicit AND. All FTS operators/punctuation are dropped. */
export function toMatch(q: string): { tokens: string[]; match: string } {
  const tokens = q.slice(0, 200).match(/[\p{L}\p{N}]+/gu)?.slice(0, 8) ?? [];
  return { tokens, match: tokens.map((t) => `"${t}"*`).join(' ') };
}

export function searchAll(s: Svc, user: User, q: string, limit = 20): Group[] {
  const { tokens, match } = toMatch(q);
  if (!tokens.length) return [];
  const { sqlite } = s;
  const cats = sqlite.prepare('select id, parent_id as parentId, name, description, archived from categories').all() as
    { id: string; parentId: string | null; name: string; description: string | null; archived: number }[];
  const hidden = hiddenCategoryIds(cats.map((c) => ({ ...c, archived: !!c.archived })), user);
  const vis = visibility(user, hidden, 'a', { includeArchived: false });
  const groups: Group[] = [];

  const rows = sqlite.prepare(
    `select a.id, a.title, a.type, a.category_id as cid, snippet(article_fts, -1, char(1), char(2), '…', 14) as snip
     from article_fts join articles a on a.id = article_fts.article_id
     where article_fts match ? and ${vis.sql}
     order by bm25(article_fts, 10, 1, 3, 2, 3, 3, 0) limit ?`,
  ).all(match, ...vis.params, limit) as { id: string; title: string; type: string; cid: string | null; snip: string }[];
  const toHit = (r: (typeof rows)[number]): Hit => ({
    id: r.id, title: r.title, categoryPath: r.cid ? categoryPath(cats, r.cid) : '',
    snippet: esc(r.snip).replace(/\u0001/g, '<mark>').replace(/\u0002/g, '</mark>'),
  });
  const art = rows.filter((r) => r.type !== 'glossary').map(toHit);
  const glo = rows.filter((r) => r.type === 'glossary').map(toHit);
  if (art.length) groups.push({ kind: 'article', hits: art });

  // flows: same rule as can(flow:read) via flowVisibilitySql (hit id = slug, the URL key)
  const flowRows = sqlite.prepare(
    `select f.slug, f.title, snippet(flow_fts, -1, char(1), char(2), '…', 14) as snip from flow_fts join flows f on f.id = flow_fts.flow_id
     where flow_fts match ? and ${flowVisibilitySql(user)} order by bm25(flow_fts, 10, 1) limit ?`,
  ).all(match, limit) as { slug: string; title: string; snip: string }[];
  if (flowRows.length) {
    groups.push({ kind: 'flow', hits: flowRows.map((r) => ({
      id: r.slug, title: r.title, categoryPath: 'Guided flow',
      snippet: esc(r.snip).replace(/\u0001/g, '<mark>').replace(/\u0002/g, '</mark>'),
    })) });
  }

  const hid = new Set(hidden);
  const like = tokens.map((t) => `%${t}%`);
  const catHits = cats.filter((c) => !hid.has(c.id) && tokens.every((t) => c.name.toLowerCase().includes(t.toLowerCase()))).slice(0, limit)
    .map((c) => ({ id: c.id, title: c.name, snippet: esc(c.description ?? ''), categoryPath: c.parentId ? categoryPath(cats, c.parentId) : '' }));
  if (catHits.length) groups.push({ kind: 'category', hits: catHits });

  const tagRows = sqlite.prepare(
    `select t.id, t.name, count(distinct a.id) n from tags t
     join article_tags x on x.tag_id = t.id join articles a on a.id = x.article_id
     where ${tokens.map(() => 't.name like ?').join(' and ')} and ${vis.sql}
     group by t.id order by n desc limit ?`,
  ).all(...like, ...vis.params, limit) as { id: string; name: string; n: number }[];
  if (tagRows.length) groups.push({ kind: 'tag', hits: tagRows.map((t) => ({ id: t.id, title: t.name, snippet: `${t.n} article${t.n === 1 ? '' : 's'}`, categoryPath: '' })) });
  if (glo.length) groups.push({ kind: 'glossary', hits: glo });
  return groups;
}

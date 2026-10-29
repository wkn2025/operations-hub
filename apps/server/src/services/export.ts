import type BetterSqlite3 from 'better-sqlite3';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, resolve, sep } from 'node:path';
import type { PmNode } from '@ops/shared';
import { stamp } from './backup';
import type { ZipEntry } from './zip';

export interface MdContext {
  slugs?: Record<string, string>; // article id -> slug (internal links become ./<slug>.md)
  files?: Record<string, string>; // file id -> exported file name under files/
}

const ALERT: Record<string, string> = { info: 'NOTE', tip: 'TIP', warning: 'WARNING', danger: 'CAUTION', success: 'NOTE' };
const escText = (s: string) => s.replace(/[\\`*_[\]~]/g, '\\$&');
const escHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const str = (v: unknown) => (typeof v === 'string' ? v : '');
const indent = (s: string, n: number) => s.split('\n').map((l, i) => (i === 0 || !l ? l : ' '.repeat(n) + l)).join('\n');

function inline(nodes: PmNode[] | undefined, ctx: MdContext): string {
  return (nodes ?? []).map((n) => {
    if (n.type === 'hardBreak') return '  \n';
    if (n.type === 'internalLink') {
      const slug = ctx.slugs?.[str(n.attrs?.articleId)];
      const label = escText(str(n.attrs?.label) || 'link');
      return slug ? `[${label}](./${slug}.md)` : label;
    }
    if (n.type === 'image') return image(n, ctx);
    if (n.type !== 'text') return `<!-- unsupported: ${n.type} -->`;
    const marks = new Set((n.marks ?? []).map((m) => m.type));
    let s = marks.has('code') ? '`' + str(n.text).replace(/`/g, '\\`') + '`' : escText(str(n.text));
    if (marks.has('bold')) s = `**${s}**`;
    if (marks.has('italic')) s = `*${s}*`;
    if (marks.has('strike')) s = `~~${s}~~`;
    if (marks.has('underline')) s = `<u>${s}</u>`;
    if (marks.has('highlight')) s = `==${s}==`;
    const link = n.marks?.find((m) => m.type === 'link');
    if (link) s = `[${s}](${str(link.attrs?.href).replace(/[()\s]/g, encodeURIComponent)})`;
    return s;
  }).join('');
}

function image(n: PmNode, ctx: MdContext) {
  const src = str(n.attrs?.src), id = /^\/api\/files\/([\w-]+)$/.exec(src)?.[1];
  const target = id ? `../files/${ctx.files?.[id] ?? id}` : src;
  const title = str(n.attrs?.title);
  return `![${escText(str(n.attrs?.alt))}](${target}${title ? ` "${title.replace(/"/g, '\\"')}"` : ''})`;
}

const blocks = (nodes: PmNode[] | undefined, ctx: MdContext, sep = '\n\n') => (nodes ?? []).map((n) => block(n, ctx)).filter((s) => s !== '').join(sep);
const list = (items: PmNode[] | undefined, marker: (i: number, n: PmNode) => string, ctx: MdContext) =>
  (items ?? []).map((it, i) => { const m = marker(i, it); return m + indent(blocks(it.content, ctx, '\n'), m.length); }).join('\n');
const cell = (c: PmNode, ctx: MdContext) => (c.content ?? []).map((p) => inline(p.content, ctx)).join('<br>').replace(/\|/g, '\\|').replace(/\n/g, ' ');

function block(n: PmNode, ctx: MdContext): string {
  switch (n.type) {
    case 'paragraph':
      return inline(n.content, ctx).replace(/^(\d+)\.(?=\s)/, '$1\\.').replace(/^([#>+-])(?=\s)/, '\\$1');
    case 'heading':
      return '#'.repeat(Math.min(Math.max(Number(n.attrs?.level) || 1, 1), 6)) + ' ' + inline(n.content, ctx);
    case 'bulletList':
      return list(n.content, () => '- ', ctx);
    case 'orderedList': {
      const start = Number(n.attrs?.start) || 1;
      return list(n.content, (i) => `${start + i}. `, ctx);
    }
    case 'taskList':
      return list(n.content, (_i, it) => (it.attrs?.checked ? '- [x] ' : '- [ ] '), ctx);
    case 'steps':
      return (n.content ?? []).map((s, i) => {
        const m = `${i + 1}. `, title = str(s.attrs?.title), body = blocks(s.content, ctx);
        return m + indent(title ? `**${escText(title)}**${body ? '\n\n' + body : ''}` : body, m.length);
      }).join('\n');
    case 'blockquote':
      return blocks(n.content, ctx).split('\n').map((l) => (l ? `> ${l}` : '>')).join('\n');
    case 'callout': {
      const head = `[!${ALERT[str(n.attrs?.kind)] ?? 'NOTE'}]${n.attrs?.title ? ' ' + escText(str(n.attrs.title)) : ''}`;
      return [head, ...blocks(n.content, ctx).split('\n')].map((l) => (l ? `> ${l}` : '>')).join('\n');
    }
    case 'collapsible':
      return `<details>\n<summary>${escHtml(str(n.attrs?.title))}</summary>\n\n${blocks(n.content, ctx)}\n\n</details>`;
    case 'codeBlock': {
      const code = (n.content ?? []).map((t) => str(t.text)).join('');
      const fence = code.includes('```') ? '~~~~' : '```';
      return `${fence}${str(n.attrs?.language)}\n${code}\n${fence}`;
    }
    case 'horizontalRule':
      return '---';
    case 'table': {
      const rows = (n.content ?? []).map((r) => (r.content ?? []).map((c) => cell(c, ctx)));
      if (!rows.length) return '';
      const width = Math.max(...rows.map((r) => r.length));
      const line = (r: string[]) => '| ' + Array.from({ length: width }, (_, i) => r[i] ?? '').join(' | ') + ' |';
      return [line(rows[0]), '| ' + Array(width).fill('---').join(' | ') + ' |', ...rows.slice(1).map(line)].join('\n');
    }
    case 'image':
      return image(n, ctx);
    case 'doc':
      return blocks(n.content, ctx);
    default:
      return `<!-- unsupported: ${n.type} -->`;
  }
}

/** ProseMirror JSON (the shapes in @ops/shared PM_NODES/PM_MARKS) -> GitHub-flavoured Markdown. Tolerates malformed input. */
export function pmToMarkdown(doc: unknown, ctx: MdContext = {}): string {
  if (!doc || typeof doc !== 'object') return '';
  const out = block(doc as PmNode, ctx);
  return out ? out + '\n' : '';
}

interface ArticleRow {
  id: string; slug: string; title: string; type: string; status: string; category_id: string | null; owner_id: string | null;
  content: string; fields: string; review_date: string | null; revision: number; created_at: string | null; updated_at: string | null; published_at: string | null;
}
const parseJson = (s: string | null, fallback: unknown) => { try { return s ? JSON.parse(s) : fallback; } catch { return fallback; } };

/**
 * Every article (all statuses, so the export doubles as a content archive) as articles/<slug>.json + .md,
 * every flow as flows/<slug>.json, the files those articles use under files/, and an index.json.
 */
export function exportEntries(sqlite: BetterSqlite3.Database, dataDir: string): ZipEntry[] {
  const arts = sqlite.prepare('select * from articles order by slug').all() as ArticleRow[];
  const cats = new Map((sqlite.prepare('select id, parent_id, name from categories').all() as { id: string; parent_id: string | null; name: string }[]).map((c) => [c.id, c]));
  const path = (id: string | null): string => { const c = id ? cats.get(id) : undefined; return c ? [path(c.parent_id), c.name].filter(Boolean).join(' / ') : ''; };
  const owners = new Map((sqlite.prepare('select id, name, email from users').all() as { id: string; name: string; email: string }[]).map((u) => [u.id, u]));
  const tagStmt = sqlite.prepare('select t.name from tags t join article_tags x on x.tag_id = t.id where x.article_id = ? order by t.name');
  const fileRows = sqlite.prepare('select distinct f.id, f.name, f.mime, f.path from files f join article_files af on af.file_id = f.id').all() as { id: string; name: string; mime: string; path: string }[];
  const fileNames = Object.fromEntries(fileRows.map((f) => [f.id, f.id + extname(f.name).toLowerCase().replace(/[^.\w]/g, '')]));
  const slugs = Object.fromEntries(arts.map((a) => [a.id, a.slug]));
  const ctx = { slugs, files: fileNames };

  const out: ZipEntry[] = [];
  const index: unknown[] = [];
  for (const a of arts) {
    const owner = a.owner_id ? owners.get(a.owner_id) : undefined;
    const meta = {
      id: a.id, slug: a.slug, title: a.title, type: a.type, status: a.status, category: path(a.category_id), categoryId: a.category_id,
      owner: owner ? { id: owner.id, name: owner.name, email: owner.email } : null,
      tags: (tagStmt.all(a.id) as { name: string }[]).map((t) => t.name),
      fields: parseJson(a.fields, {}), reviewDate: a.review_date, revision: a.revision,
      createdAt: a.created_at, updatedAt: a.updated_at, publishedAt: a.published_at,
    };
    const content = parseJson(a.content, null);
    out.push({ name: `articles/${a.slug}.json`, data: Buffer.from(JSON.stringify({ ...meta, content }, null, 2) + '\n') });
    const front = Object.entries({ ...meta, owner: owner?.name ?? null }).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join('\n');
    out.push({ name: `articles/${a.slug}.md`, data: Buffer.from(`---\n${front}\n---\n\n# ${escText(a.title)}\n\n${pmToMarkdown(content, ctx)}`) });
    index.push({ id: a.id, slug: a.slug, title: a.title, status: a.status, type: a.type, category: meta.category });
  }
  const flows = sqlite.prepare('select id, slug, title, status, article_id, start_id, nodes, revision, published_at from flows order by slug').all() as Record<string, any>[];
  for (const f of flows) out.push({ name: `flows/${f.slug}.json`, data: Buffer.from(JSON.stringify({ ...f, nodes: parseJson(f.nodes, []) }, null, 2) + '\n') });
  for (const f of fileRows) {
    const p = resolve(dataDir, 'uploads', f.path);
    if (existsSync(p)) out.push({ name: `files/${fileNames[f.id]}`, data: readFileSync(p) });
  }
  out.push({
    name: 'index.json',
    data: Buffer.from(JSON.stringify({ exportedAt: new Date().toISOString(), articles: index, flows: flows.map((f) => ({ slug: f.slug, title: f.title, status: f.status })), files: fileRows.map((f) => ({ file: fileNames[f.id], name: f.name, mime: f.mime })) }, null, 2) + '\n'),
  });
  return out;
}

/** Writes exportEntries to <outRoot>/<timestamp>/ and returns that directory. */
export function writeExport(sqlite: BetterSqlite3.Database, dataDir: string, outRoot: string): string {
  const dir = resolve(outRoot, stamp());
  for (const e of exportEntries(sqlite, dataDir)) {
    const p = join(dir, e.name);
    if (!p.startsWith(dir + sep)) throw new Error(`export: unsafe entry name ${e.name}`); // slugs are [a-z0-9-] (uniqueSlug); belt and braces
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, e.data);
  }
  return dir;
}

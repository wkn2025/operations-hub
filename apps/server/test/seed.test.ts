import { describe, it, expect, beforeAll } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ARTICLE_TYPES, PM_NODES, PM_MARKS, type PmNode } from '@ops/shared';
import { setup, type Ctx } from './helpers';
import { seedDemo, CATEGORY_TREE } from '../src/seed/base';
import { SEED_ARTICLES } from '../src/seed/content/articles';

let c: Ctx;
let revsAfterFirst = 0;
beforeAll(async () => {
  c = await setup(mkdtempSync(join(tmpdir(), 'ops-seed-')));
  await seedDemo(c.app);
  revsAfterFirst = (c.app.sqlite.prepare('select count(*) n from revisions').get() as { n: number }).n;
  await seedDemo(c.app);
});

const all = <T>(sql: string, ...args: unknown[]) => c.app.sqlite.prepare(sql).all(...args) as T[];
type Row = { id: string; title: string; type: string; content: string; category_id: string };
const published = () => all<Row>("select id, title, type, content, category_id from articles where status = 'published'");

function walk(n: PmNode, f: (n: PmNode) => void) { f(n); n.content?.forEach((x) => walk(x, f)); }

describe('seedDemo (Task 9)', () => {
  it('is idempotent: second run adds no articles, revisions, flows or files', () => {
    expect((c.app.sqlite.prepare('select count(*) n from revisions').get() as { n: number }).n).toBe(revsAfterFirst);
    expect(all('select id from articles')).toHaveLength(SEED_ARTICLES.length);
    expect(all('select id from flows')).toHaveLength(3);
    const dupFiles = all("select name from files group by name having count(*) > 1");
    expect(dupFiles).toEqual([]);
  });

  it('publishes at least 30 articles, at least 2 in each of the 9 top-level categories (incl. subcategories)', () => {
    const arts = published();
    expect(arts.length).toBeGreaterThanOrEqual(30);
    const cats = all<{ id: string; name: string; parent_id: string | null }>('select id, name, parent_id from categories');
    const topOf = (id: string): string => { const x = cats.find((k) => k.id === id)!; return x.parent_id ? topOf(x.parent_id) : x.name; };
    for (const t of CATEGORY_TREE) expect(arts.filter((a) => topOf(a.category_id) === t.name).length, t.name).toBeGreaterThanOrEqual(2);
  });

  it('has at least 6 articles of each of the 6 templates', () => {
    const arts = published();
    for (const t of ARTICLE_TYPES) expect(arts.filter((a) => a.type === t).length, t).toBeGreaterThanOrEqual(6);
  });

  it('has at least 3 published flows and the three demo users', () => {
    expect(all("select id from flows where status = 'published'").length).toBeGreaterThanOrEqual(3);
    const users = all<{ email: string; role: string }>('select email, role from users');
    expect(users).toEqual(expect.arrayContaining([
      { email: 'admin@demo.test', role: 'admin' }, { email: 'editor@demo.test', role: 'editor' }, { email: 'viewer@demo.test', role: 'viewer' },
    ]));
  });

  it('marks every article DEMO, resolves every internal link and uses only renderer-supported nodes', () => {
    const ids = new Set(published().map((a) => a.id));
    const nodeTypes = new Set<string>(Object.values(PM_NODES));
    const markTypes = new Set<string>(PM_MARKS);
    let links = 0;
    for (const a of published()) {
      expect(a.content, a.title).toContain('DEMO content');
      // eslint-disable-next-line no-control-regex
      expect(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(a.content), a.title).toBe(false);
      walk(JSON.parse(a.content), (n) => {
        expect(nodeTypes.has(n.type), `${a.title}: node ${n.type}`).toBe(true);
        n.marks?.forEach((m) => expect(markTypes.has(m.type), `${a.title}: mark ${m.type}`).toBe(true));
        if (n.type === 'internalLink') { links++; expect(ids.has(n.attrs!.articleId as string), `${a.title} -> ${n.attrs!.label}`).toBe(true); }
        if (n.type === 'image') expect(n.attrs!.src, a.title).toMatch(/^\/api\/files\/[\w-]+$/);
        if (n.type === 'text') expect(n.text, `${a.title}: empty text node`).toBeTruthy(); // ProseMirror rejects empty text nodes
      });
    }
    expect(links).toBeGreaterThanOrEqual(30);
    const dangling = all("select l.from_article_id from article_links l left join articles a on a.id = l.to_article_id where a.id is null");
    expect(dangling).toEqual([]);
  });

  it('embeds at least 4 distinct SVG screenshots, readable by a viewer', async () => {
    const fileIds = all<{ file_id: string }>("select distinct file_id from article_files where source = 'embedded'");
    expect(fileIds.length).toBeGreaterThanOrEqual(4);
    for (const { file_id } of fileIds) {
      const r = await c.app.inject({ method: 'GET', url: `/api/files/${file_id}`, headers: { cookie: c.viewer } });
      expect(r.statusCode).toBe(200);
      expect(r.headers['content-type']).toContain('image/svg+xml');
    }
  });

  it('covers the required operational topics and search finds the new articles by title', async () => {
    const cases: [string, string][] = [
      ['MacroHealth 837P', 'MacroHealth EDI: 837P and 837I exchange'],
      ['UHCG Direct pipeline', 'UHCG Direct EDI: inbound 837I pipeline'],
      ['segment-by-segment', '837 claim file: segment-by-segment guide'],
      ['277CA', 'Acknowledgements: 999 and 277CA handling'],
      ['IK5', '999 rejected a whole batch (IK5*R)'],
      ['missing GOP', 'Request a missing GOP'],
      ['member reimbursement', 'Process a member reimbursement'],
      ['denial reasons', 'Invoice denial reasons and how to explain them'],
      ['medical records request', 'Send a medical records request'],
      ['Bluefin', 'Bluefin Corporate Health: coverage summary'],
      ['Atlas Student', 'Atlas Student Travel Cover: coverage summary'],
      ['returned bank', 'Payment returned by the bank'],
      ['onboard network provider', 'Onboard a new network provider'],
      ['ECNet payment files', 'ECNet: postings and payment files'],
      ['Globo guarantees', 'Globo: cases, guarantees and invoices'],
      ['acronyms', 'Operations acronyms A to Z'],
      ['Explanation of Benefits', 'Explanation of Benefits (EOB)'],
    ];
    for (const [q, title] of cases) {
      const r = await c.req(c.viewer, 'GET', `/api/search?q=${encodeURIComponent(q)}`);
      expect(r.status, q).toBe(200);
      const titles = (r.body.groups as { hits: { title: string }[] }[]).flatMap((g) => g.hits.map((h) => h.title));
      expect(titles, q).toContain(title);
    }
  });

  it('seed titles are unique and every client is fictional-labelled', () => {
    expect(new Set(SEED_ARTICLES.map((a) => a.title)).size).toBe(SEED_ARTICLES.length);
    for (const a of SEED_ARTICLES.filter((x) => x.type === 'client_terms')) expect(a.fields?.client, a.title).toMatch(/fictional/i);
  });
});

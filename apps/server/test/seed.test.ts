import { describe, it, expect, beforeAll } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ARTICLE_TYPES, PM_NODES, PM_MARKS, type PmNode } from '@ops/shared';
import { setup, type Ctx } from './helpers';
import { seedDemo, CATEGORY_TREE } from '../src/seed/base';
import { SEED_ARTICLES } from '../src/seed/content/articles';
import { AMERICAS_BANKS } from '../src/seed/content/bank-americas';
import { indexArticle } from '../src/services/search';
import { safeHref } from '../../web/src/lib/text';

const REIMB = 'Reimbursement: from document intake to proof of payment';
/** EDI & Automation rework (Feature E): real procedure from the EDI 101 reference, no DEMO label. Golden list, not read from the seed. */
const EDI_REAL: [string, string][] = [
  ['EDI 101: the three files and the loop', 'EDI & Automation / EDI 101'],
  ['Importing EDI invoices into Globo: the three checks', 'EDI & Automation / Import & web.transformer'],
  ['web.transformer: Missing Claim', 'EDI & Automation / Import & web.transformer'],
  ['web.transformer: Missing GOP', 'EDI & Automation / Import & web.transformer'],
  ['web.transformer: All Entries', 'EDI & Automation / Import & web.transformer'],
  ['web.transformer: Manual Handling', 'EDI & Automation / Import & web.transformer'],
  ['Adjudicating an EDI invoice: reductions, denials and MRR', 'EDI & Automation / Adjudication & adjustments'],
  ['EDI denial codes', 'EDI & Automation / Adjudication & adjustments'],
  ['Changing a coverage decision on an EDI invoice', 'EDI & Automation / Adjudication & adjustments'],
  ['EDI claim failed to import', 'EDI & Automation / EDI issues'],
  ['837 Health Care Claim', 'Glossary & Acronyms / EDI terms'],
  ['PCF file', 'Glossary & Acronyms / EDI terms'],
  ['835 payment file', 'Glossary & Acronyms / EDI terms'],
];
const EDI_OLD = ['UHCG Direct EDI: inbound 837I pipeline', 'MacroHealth EDI: 837P and 837I exchange', '837 claim file: segment-by-segment guide',
  'Acknowledgements: 999 and 277CA handling', '999 rejected a whole batch (IK5*R)', 'MacroHealth file not picked up',
  '999 Implementation Acknowledgement', 'ISA/GS interchange envelope'];
const RETIRED = ['Approve a claim for payment', 'Process a member reimbursement', 'Send a medical records request',
  'Invoice denial reasons and how to explain them', 'Handling medical records requests'];

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
    expect(all('select id from flows')).toHaveLength(4);
    const dupFiles = all("select name from files group by name having count(*) > 1");
    expect(dupFiles).toEqual([]);
  });

  it('publishes at least 30 articles, at least 2 in each of the 8 top-level categories (incl. subcategories)', () => {
    const arts = published();
    expect(arts.length).toBeGreaterThanOrEqual(30);
    const cats = all<{ id: string; name: string; parent_id: string | null }>('select id, name, parent_id from categories');
    const topOf = (id: string): string => { const x = cats.find((k) => k.id === id)!; return x.parent_id ? topOf(x.parent_id) : x.name; };
    for (const t of CATEGORY_TREE) expect(arts.filter((a) => topOf(a.category_id) === t.name).length, t.name).toBeGreaterThanOrEqual(2);
  });

  it('has at least 6 articles of each template (5 for client_terms: the T&C categories hold only full terms)', () => {
    const arts = published();
    for (const t of ARTICLE_TYPES) expect(arts.filter((a) => a.type === t).length, t).toBeGreaterThanOrEqual(t === 'client_terms' ? 5 : 6);
  });

  it('has at least 3 published flows and the three demo users', () => {
    expect(all("select id from flows where status = 'published'").length).toBeGreaterThanOrEqual(3);
    const users = all<{ email: string; role: string }>('select email, role from users');
    expect(users).toEqual(expect.arrayContaining([
      { email: 'admin@demo.test', role: 'admin' }, { email: 'editor@demo.test', role: 'editor' }, { email: 'viewer@demo.test', role: 'viewer' },
    ]));
  });

  it('marks every article DEMO (except the real EDI procedure), resolves every internal link and uses only renderer-supported nodes', () => {
    const ids = new Set(published().map((a) => a.id));
    const nodeTypes = new Set<string>(Object.values(PM_NODES));
    const markTypes = new Set<string>(PM_MARKS);
    const real = new Set(EDI_REAL.map(([t]) => t));
    let links = 0;
    for (const a of published()) {
      if (real.has(a.title)) expect(a.content, a.title).not.toMatch(/DEMO/);
      else expect(a.content, a.title).toContain('DEMO content');
      // eslint-disable-next-line no-control-regex
      expect(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(a.content), a.title).toBe(false);
      walk(JSON.parse(a.content), (n) => {
        expect(nodeTypes.has(n.type), `${a.title}: node ${n.type}`).toBe(true);
        n.marks?.forEach((m) => expect(markTypes.has(m.type), `${a.title}: mark ${m.type}`).toBe(true));
        if (n.type === 'internalLink') { links++; expect(ids.has(n.attrs!.articleId as string), `${a.title} -> ${n.attrs!.label}`).toBe(true); }
        if (n.type === 'image') { expect(n.attrs!.src, a.title).toMatch(/^\/api\/files\/[\w-]+$/); expect(String(n.attrs!.alt ?? '').length, `${a.title}: image alt`).toBeGreaterThan(20); }
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
      ['EDI 101', 'EDI 101: the three files and the loop'],
      ['shared folder', 'EDI 101: the three files and the loop'],
      ['web.transformer Missing Claim', 'web.transformer: Missing Claim'],
      ['Missing GOP', 'web.transformer: Missing GOP'],
      ['UHAP ID', 'web.transformer: All Entries'],
      ['Manual Handling Vat ID', 'web.transformer: Manual Handling'],
      ['MRR On Hold', 'Adjudicating an EDI invoice: reductions, denials and MRR'],
      ['denial codes', 'EDI denial codes'],
      ['Pre-existing', 'EDI denial codes'],
      ['refund and create a copy', 'Changing a coverage decision on an EDI invoice'],
      ['PCF', 'PCF file'],
      ['835', '835 payment file'],
      ['missing GOP', 'Request a missing GOP'],
      ['member reimbursement', REIMB],
      ['denial reasons', REIMB],
      ['medical records request', REIMB],
      ['proof of payment', REIMB],
      ['pre-payment QA checklist', 'Claim file pre-payment QA checklist'],
      ['Bluefin', 'Bluefin Corporate Health: full terms and conditions'],
      ['Wayfarer', 'Wayfarer Family Travel Plan: policy terms and conditions'],
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

describe('client directory', () => {
  it('every client has corporate and travel, each with full T&C and coverage summary, filed under the top category', () => {
    const terms = SEED_ARTICLES.filter((a) => a.type === 'client_terms' && a.category.startsWith('Clients & Terms and Conditions'));
    const byClient = new Map<string, string[]>();
    for (const a of terms) {
      expect(a.category, a.title).toBe('Clients & Terms and Conditions');
      expect(['corporate', 'travel'], a.title).toContain(a.fields?.line);
      expect(['full', 'summary'], a.title).toContain(a.fields?.docKind);
      byClient.set(a.fields!.client!, [...(byClient.get(a.fields!.client!) ?? []), `${a.fields!.line}/${a.fields!.docKind}`]);
    }
    expect(byClient.size).toBeGreaterThanOrEqual(4);
    for (const [client, combos] of byClient) expect(combos.sort(), client).toEqual(['corporate/full', 'corporate/summary', 'travel/full', 'travel/summary']);
    expect(CATEGORY_TREE.find((t) => t.name === 'Clients & Terms and Conditions')!.children).toEqual([]);
  });
});

describe('category restructure', () => {
  it('has the 8 top-level categories with the moved subcategories', () => {
    const tree = Object.fromEntries(CATEGORY_TREE.map((t) => [t.name, t.children]));
    expect(Object.keys(tree)).toEqual(['EDI & Automation', 'Clients & Terms and Conditions', 'Work Instructions', 'Quality Assurance',
      'Provider Networks & Partners', 'Finance & Payment Processing', 'Internal Systems', 'Glossary & Acronyms']);
    expect(tree['EDI & Automation']).toEqual(['EDI 101', 'Import & web.transformer', 'Adjudication & adjustments', 'EDI issues']);
    expect(tree['Finance & Payment Processing']).toContain('Payment issues');
    expect(tree['Work Instructions']).toEqual(['Case handling', 'Invoice processing', 'Reimbursements']);
    expect(tree['Quality Assurance']).toEqual(['Quality checks', 'Audit & sampling']);
    expect(tree['Finance & Payment Processing']).toEqual(['Payment runs', 'Currency & fees', 'Reconciliation', 'Payment issues', 'Global codes', 'Bank information']);
  });

  it('merges the claims articles into one DEMO work instruction covering intake to proof of payment', () => {
    for (const t of RETIRED) expect(SEED_ARTICLES.find((a) => a.title === t), t).toBeUndefined();
    const a = SEED_ARTICLES.find((x) => x.title === REIMB)!;
    expect(a).toBeDefined();
    expect(a.type).toBe('work_instruction');
    expect(a.category).toBe('Work Instructions / Reimbursements');
    const text = JSON.stringify(a.content);
    for (const re of [/complete/i, /medical records/i, /approval limits/i, /D01/, /D07/, /payment run/i, /proof of payment/i, /retention/i])
      expect(text, String(re)).toMatch(re);
    expect(SEED_ARTICLES.filter((x) => x.category === 'Work Instructions / Reimbursements')).toHaveLength(1);
  });

  it('files the troubleshooting articles under EDI & Automation and Finance, and QA articles under Quality Assurance', () => {
    const cat = (t: string) => SEED_ARTICLES.find((a) => a.title === t)?.category;
    expect(cat('EDI claim failed to import')).toBe('EDI & Automation / EDI issues');
    expect(cat('Provider disputes an invoice denial')).toBe('Finance & Payment Processing / Payment issues');
    expect(SEED_ARTICLES.filter((a) => a.category.startsWith('Quality Assurance / ')).length).toBeGreaterThanOrEqual(2);
    expect(SEED_ARTICLES.some((a) => /Troubleshooting Center|Claims & Reimbursements/.test(a.category))).toBe(false);
  });
});

describe('seed upgrades a database seeded with the old 9-category tree', () => {
  const LEGACY: [string, string[]][] = [
    ['EDI & Automation', ['Inbound claims (837)', 'Acknowledgements (999/277)', 'Automation scripts']],
    ['Clients & Terms and Conditions', ['Travel insurance clients', 'Corporate clients', 'Coverage summaries']],
    ['Work Instructions', ['Case handling', 'Invoice processing', 'Quality checks']],
    ['Claims & Reimbursements', ['Claim intake', 'Reimbursements', 'Medical records']],
    ['Provider Networks & Partners', ['Hospital network', 'Assistance partners']],
    ['Finance & Payment Processing', ['Payment runs', 'Currency & fees', 'Reconciliation']],
    ['Internal Systems', ['Globo', 'ECNet', 'Access & permissions']],
    ['Troubleshooting Center', ['EDI issues', 'Payment issues']],
    ['Glossary & Acronyms', ['EDI terms', 'Medical terms']],
  ];
  let u: Ctx;
  const ids = new Map<string, string>();
  type Cat = { id: string; name: string; parent_id: string | null; archived: number };
  const cats = () => u.app.sqlite.prepare('select id, name, parent_id, archived from categories').all() as Cat[];
  const art = (slug: string) => u.app.sqlite.prepare('select id, status, category_id from articles where slug = ?').get(slug) as { id: string; status: string; category_id: string } | undefined;
  const legacyArticles: [string, string][] = [
    ['EDI claim failed to import', 'Troubleshooting Center / EDI issues'],
    ['Approve a claim for payment', 'Claims & Reimbursements / Claim intake'],
    ['Handling medical records requests', 'Claims & Reimbursements / Medical records'],
    ['Process a member reimbursement', 'Claims & Reimbursements / Reimbursements'],
    ['Bluefin Corporate Health: coverage summary', 'Clients & Terms and Conditions / Coverage summaries'],
    ['Team QA notes (user content)', 'Work Instructions / Quality checks'],
    // the old fictional EDI set (Feature E deletes these on re-seed)
    ['UHCG Direct EDI: inbound 837I pipeline', 'EDI & Automation / Inbound claims (837)'],
    ['MacroHealth EDI: 837P and 837I exchange', 'EDI & Automation / Inbound claims (837)'],
    ['837 claim file: segment-by-segment guide', 'EDI & Automation / Inbound claims (837)'],
    ['Acknowledgements: 999 and 277CA handling', 'EDI & Automation / Acknowledgements (999/277)'],
    ['999 rejected a whole batch (IK5*R)', 'Troubleshooting Center / EDI issues'],
    ['MacroHealth file not picked up', 'Troubleshooting Center / EDI issues'],
    ['999 Implementation Acknowledgement', 'Glossary & Acronyms / EDI terms'],
    ['ISA/GS interchange envelope', 'Glossary & Acronyms / EDI terms'],
  ];
  const oldIds: string[] = [];
  const keptIds: string[] = []; // retired titles that a real user wrote or edited: must survive the re-seed
  let snapshot = '';
  const state = () => JSON.stringify([cats().sort((a, b) => a.id.localeCompare(b.id)),
    u.app.sqlite.prepare('select id, status, category_id, revision from articles order by id').all(),
    (u.app.sqlite.prepare('select count(*) n from revisions').get() as { n: number }).n]);

  beforeAll(async () => {
    u = await setup(mkdtempSync(join(tmpdir(), 'ops-seed-up-')));
    for (const [i, [top, children]] of LEGACY.entries()) {
      const t = await u.req(u.admin, 'POST', '/api/categories', { name: top, description: 'old', sortOrder: i });
      ids.set(top, t.body.id);
      for (const [j, ch] of children.entries()) ids.set(`${top} / ${ch}`, (await u.req(u.admin, 'POST', '/api/categories', { name: ch, parentId: t.body.id, sortOrder: j })).body.id);
    }
    for (const [title, cat] of legacyArticles) {
      const a = await u.req(u.admin, 'POST', '/api/articles', { title, categoryId: ids.get(cat), content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'old' }] }] } });
      expect(a.status, title).toBe(201);
      expect((await u.req(u.admin, 'POST', `/api/articles/${a.body.id}/publish`)).status).toBe(200);
      ids.set(title, a.body.id);
      if (EDI_OLD.includes(title)) oldIds.push(a.body.id);
    }
    // old articles link to each other, carry tags and an extra revision; a user article links to one of them
    const [first, second] = oldIds;
    const linkDoc = (to: string) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'internalLink', attrs: { articleId: to, label: 'old link' } }] }] });
    const cur = (await u.req(u.admin, 'GET', `/api/articles/${first}`)).body;
    expect((await u.req(u.admin, 'PATCH', `/api/articles/${first}`, { baseRevision: cur.revision, content: linkDoc(second!), tags: ['edi', 'old'] })).status).toBe(200);
    expect((await u.req(u.admin, 'POST', '/api/articles', { title: 'User note linking old EDI', categoryId: ids.get('Glossary & Acronyms / EDI terms'), content: linkDoc(first!) })).status).toBe(201);
    expect(oldIds).toHaveLength(EDI_OLD.length);
    // the old seed wrote them as the demo admin: make them seed-owned (owner and every revision author)
    const demoAdmin = crypto.randomUUID();
    u.app.sqlite.prepare("insert into users(id, email, name, role, role_set_by_admin, created_at) values (?, 'admin@demo.test', 'Demo Admin', 'admin', 1, ?)").run(demoAdmin, new Date().toISOString());
    const marks = oldIds.map(() => '?').join(',');
    u.app.sqlite.prepare(`update articles set owner_id = ? where id in (${marks})`).run(demoAdmin, ...oldIds);
    u.app.sqlite.prepare(`update revisions set author_id = ? where article_id in (${marks})`).run(demoAdmin, ...oldIds);
    // negatives: a seed-owned one later edited by a real user, and a user's own article with a retired title
    const edited = oldIds.pop()!;
    const e = (await u.req(u.admin, 'GET', `/api/articles/${edited}`)).body;
    expect((await u.req(u.admin, 'PATCH', `/api/articles/${edited}`, { baseRevision: e.revision, content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'our own notes' }] }] } })).status).toBe(200);
    const own = await u.req(u.admin, 'POST', '/api/articles', { title: EDI_OLD[0], categoryId: ids.get('Glossary & Acronyms / EDI terms') });
    expect(own.status).toBe(201);
    keptIds.push(edited, own.body.id);
    await seedDemo(u.app);
    snapshot = state();
    await seedDemo(u.app);
  });

  it('moves the legacy subcategories in place: same ids, new parents, articles follow', () => {
    const byId = new Map(cats().map((x) => [x.id, x]));
    const parentName = (id: string) => byId.get(byId.get(id)!.parent_id!)!.name;
    expect(parentName(ids.get('Troubleshooting Center / EDI issues')!)).toBe('EDI & Automation');
    expect(parentName(ids.get('Troubleshooting Center / Payment issues')!)).toBe('Finance & Payment Processing');
    expect(parentName(ids.get('Claims & Reimbursements / Reimbursements')!)).toBe('Work Instructions');
    expect(parentName(ids.get('Work Instructions / Quality checks')!)).toBe('Quality Assurance');
    expect(art('edi-claim-failed-to-import')).toMatchObject({ status: 'published', category_id: ids.get('Troubleshooting Center / EDI issues') });
    expect(art('team-qa-notes-user-content')).toMatchObject({ status: 'published', category_id: ids.get('Work Instructions / Quality checks') });
  });

  it('archives the legacy tops, the emptied subcategories and the retired articles; no duplicate active names', () => {
    const active = cats().filter((x) => !x.archived);
    const tops = active.filter((x) => !x.parent_id).map((x) => x.name);
    expect(tops.sort()).toEqual(CATEGORY_TREE.map((t) => t.name).sort());
    const visible = (u.app.sqlite.prepare('select name from categories where parent_id is null and archived = 0 order by sort_order, name').all() as { name: string }[]).map((x) => x.name);
    expect(visible).toEqual(CATEGORY_TREE.map((t) => t.name));
    for (const k of ['Troubleshooting Center', 'Claims & Reimbursements', 'Claims & Reimbursements / Claim intake', 'Claims & Reimbursements / Medical records'])
      expect(cats().find((x) => x.id === ids.get(k))!.archived, k).toBe(1);
    const key = (x: Cat) => `${x.parent_id}/${x.name}`;
    expect(new Set(active.map(key)).size).toBe(active.length);
    expect(active.length).toBe(CATEGORY_TREE.length + CATEGORY_TREE.reduce((n, t) => n + t.children.length, 0));
    for (const s of ['approve-a-claim-for-payment', 'handling-medical-records-requests', 'process-a-member-reimbursement'])
      expect(art(s)?.status, s).toBe('archived');
    // retired earlier, brought back by the client directory: same row (history kept), published, moved to the top category
    expect(art('bluefin-corporate-health-coverage-summary')).toMatchObject({ id: ids.get('Bluefin Corporate Health: coverage summary'), status: 'published', category_id: ids.get('Clients & Terms and Conditions') });
    for (const k of ['Travel insurance clients', 'Corporate clients', 'Coverage summaries'])
      expect(cats().find((x) => x.id === ids.get(`Clients & Terms and Conditions / ${k}`))!.archived, k).toBe(1);
    const reimb = u.app.sqlite.prepare("select count(*) n from articles where category_id = ? and status <> 'archived'").get(ids.get('Claims & Reimbursements / Reimbursements')) as { n: number };
    expect(reimb.n).toBe(1);
  });

  it('gives an existing Finance category the Global codes and Bank information subcategories', () => {
    const active = cats().filter((x) => !x.archived);
    const kids = active.filter((x) => x.parent_id === ids.get('Finance & Payment Processing')).map((x) => x.name);
    expect(kids).toEqual(expect.arrayContaining(['Global codes', 'Bank information']));
    expect(kids.filter((n) => n === 'Global codes' || n === 'Bank information')).toHaveLength(2);
  });

  it('search shows the new category path for moved articles', async () => {
    const r = await u.req(u.viewer, 'GET', `/api/search?q=${encodeURIComponent('failed to import')}`);
    const hit = (r.body.groups as { hits: { title: string; categoryPath: string }[] }[]).flatMap((g) => g.hits).find((h) => h.title === 'EDI claim failed to import');
    expect(hit?.categoryPath).toBe('EDI & Automation / EDI issues');
  });

  it('a second run is a no-op', () => {
    expect(state()).toBe(snapshot);
  });

  it('deletes the old fictional EDI articles with their revisions, tags, links and search rows; only the new EDI set remains', async () => {
    const marks = oldIds.map(() => '?').join(',');
    const n = (sql: string) => (u.app.sqlite.prepare(sql.replace('IDS', marks)).get(...oldIds) as { n: number }).n;
    expect(n('select count(*) n from articles where id in (IDS)')).toBe(0);
    const left = u.app.sqlite.prepare(`select id from articles where title in (${EDI_OLD.map(() => '?').join(',')})`).all(...EDI_OLD) as { id: string }[];
    expect(left.map((r) => r.id).sort()).toEqual([...keptIds].sort()); // only the user-written / user-edited ones survive
    expect(n('select count(*) n from revisions where article_id in (IDS)')).toBe(0);
    expect(n('select count(*) n from article_tags where article_id in (IDS)')).toBe(0);
    expect(n('select count(*) n from article_fts where article_id in (IDS)')).toBe(0);
    expect(u.app.sqlite.prepare('select l.from_article_id from article_links l left join articles a on a.id = l.to_article_id where a.id is null').all()).toEqual([]);
    expect(u.app.sqlite.prepare('select title from articles where title = ?').get('User note linking old EDI')).toBeDefined(); // user content kept
    for (const [title, cat] of EDI_REAL) {
      const rows = u.app.sqlite.prepare('select status, category_id from articles where title = ?').all(title) as { status: string; category_id: string }[];
      expect(rows, title).toHaveLength(1);
      expect(rows[0]!.status, title).toBe('published');
      const c = cats().find((x) => x.id === rows[0]!.category_id)!;
      expect([cats().find((x) => x.id === c.parent_id)?.name, c.name, c.archived].join(' / '), title).toBe(`${cat} / 0`);
    }
    const ediTop = cats().find((x) => x.name === 'EDI & Automation' && !x.parent_id)!;
    expect(cats().filter((x) => x.parent_id === ediTop.id && !x.archived).map((x) => x.name).sort()).toEqual(['Adjudication & adjustments', 'EDI 101', 'EDI issues', 'Import & web.transformer']);
    for (const k of ['EDI & Automation / Inbound claims (837)', 'EDI & Automation / Acknowledgements (999/277)', 'EDI & Automation / Automation scripts'])
      expect(cats().find((x) => x.id === ids.get(k))!.archived, k).toBe(1);
    for (const q of ['segment-by-segment', 'IK5', 'MacroHealth 837P', 'interchange envelope']) {
      const r = await u.req(u.viewer, 'GET', `/api/search?q=${encodeURIComponent(q)}`);
      const hits = (r.body.groups as { hits: { id: string }[] }[]).flatMap((g) => g.hits.map((h) => h.id));
      expect(hits.filter((x) => oldIds.includes(x)), q).toEqual([]);
    }
  });

  it('a surviving article that linked to a deleted one still opens; the dead target is a plain 404 (the renderer shows it as unavailable)', async () => {
    const note = u.app.sqlite.prepare('select id, content from articles where title = ?').get('User note linking old EDI') as { id: string; content: string };
    expect(note.content).toContain(oldIds[0]!); // the ProseMirror link node is left as is
    const r = await u.req(u.admin, 'GET', `/api/articles/${note.id}`);
    expect(r.status).toBe(200);
    expect(r.body.linkTargets[oldIds[0]!]).toBeUndefined(); // link row cascaded away
    expect((await u.req(u.admin, 'GET', `/api/articles/${oldIds[0]}`)).status).toBe(404);
  });
});

describe('full DEMO terms and conditions', () => {
  const common = [/^\d+\. Definitions/, /Eligibility and territory/, /Period of cover/, /Emergency medical expenses/, /Pre-existing medical conditions/,
    /vaccinations/i, /Medical evacuation and repatriation/, /Repatriation of mortal remains/, /Pregnancy and childbirth/, /Mental health/,
    /Dental emergency/, /Prescription medication/, /Guarantee of payment/, /Claims procedure/, /Luggage.*personal belongings/,
    /Personal money and documents/, /Compassionate visit/, /General exclusions/, /General conditions/, /Fraud/, /Subrogation/,
    /Other insurance/, /Sanctions/, /Complaints/, /Governing law/, /How to contact assistance/];
  const cases: [string, string, RegExp[]][] = [
    ['Wayfarer Family Travel Plan: policy terms and conditions', 'Clients & Terms and Conditions',
      [/Trip cancellation/, /Curtailment/, /Travel delay/, /Personal liability/, /Accompanying child/]],
    ['Bluefin Corporate Health: full terms and conditions', 'Clients & Terms and Conditions',
      [/Medical screening/, /Pre-trip vaccinations and health checks/, /Security and political evacuation/, /War and terrorism/, /Return of dependants/, /Authorisation thresholds/, /Annual aggregate/]],
  ];
  for (const [title, category, extra] of cases) {
    it(`${title}: right category, DEMO-labelled, a section for every benefit, published`, () => {
      const a = SEED_ARTICLES.find((x) => x.title === title);
      expect(a, title).toBeDefined();
      expect(a!.type).toBe('client_terms');
      expect(a!.category).toBe(category);
      expect(a!.fields?.client).toMatch(/\(fictional\)/);
      expect(a!.fields?.contractRef).toMatch(/-DEMO$/);
      expect(a!.fields?.validTo! >= '2027-01-01').toBe(true);
      const heads: string[] = [];
      a!.content.forEach((n) => walk(n, (x) => { if (x.type === 'heading') heads.push(x.content!.map((t) => t.text).join('')); }));
      for (const re of [...common, ...extra]) expect(heads.some((t) => new RegExp(re.source, 'i').test(t)), `${title}: heading ${re}`).toBe(true);
      const row = all<{ content: string; status: string }>('select content, status from articles where title = ?', title)[0];
      expect(row?.status).toBe('published');
      expect(row!.content).toContain('DEMO content');
    });
  }
});

describe('seed contract dates', () => {
  it('no demo client contract runs out in 2026 (the demo would show expired T&Cs within weeks)', () => {
    const ends = SEED_ARTICLES.map((a) => (a.fields as { validTo?: string } | undefined)?.validTo).filter((v): v is string => !!v);
    expect(ends.length).toBeGreaterThanOrEqual(3);
    expect(ends.filter((d) => d < '2027-01-01')).toEqual([]);
  });
});

describe('Global codes for invoice processing', () => {
  const TITLE = 'Global codes for invoice processing';
  it('is a published DEMO article in Finance / Global codes with every code and the TBC rows', () => {
    const a = SEED_ARTICLES.find((x) => x.title === TITLE);
    expect(a).toBeDefined();
    expect(a!.category).toBe('Finance & Payment Processing / Global codes');
    const row = all<{ content: string; status: string; category_id: string }>('select content, status, category_id from articles where title = ?', TITLE)[0]!;
    expect(row.status).toBe('published');
    const cat = all<{ name: string; parent: string }>('select c.name, p.name parent from categories c join categories p on p.id = c.parent_id where c.id = ?', row.category_id)[0];
    expect(cat).toEqual({ name: 'Global codes', parent: 'Finance & Payment Processing' });
    expect(row.content).toContain('DEMO content');
    for (const s of ['A00', 'A01', 'B01', 'B00', 'C12', 'M00', 'purpose of the visit']) expect(row.content, s).toContain(s);
    const text = (n: PmNode) => { let t = ''; walk(n, (x) => { if (x.text) t += x.text; }); return t; };
    const doc = JSON.parse(row.content) as PmNode;
    const rows: string[][] = [];
    walk(doc, (n) => { if (n.type === 'tableRow') rows.push(n.content!.map(text)); });
    const byCode = (k: string) => rows.find((r) => r[0] === k)!;
    expect(byCode('A00')[1]).toBe('Outpatient physician fees');
    expect(byCode('A00')[2]).toMatch(/outpatient surgeon.*separate ER doctor/i);
    expect(byCode('A01')[1]).toBe('Consultation');
    expect(byCode('A01')[2]).toMatch(/urgent care/i);
    expect(byCode('B01')[1]).toMatch(/Emergency department \(ER\)/);
    expect(byCode('B01')[2]).toMatch(/except dental: M00/);
    expect(byCode('B00')[1]).toBe('Inpatient physician fees');
    expect(byCode('B00')[2]).toMatch(/doctor fees during a hospital stay/i);
    expect(byCode('B00')[2]).toMatch(/inpatient surgery.*routine daily doctor fees/i);
    expect(byCode('B00')[2]).not.toMatch(/outpatient/i);
    expect(byCode('B00')[3]).toMatch(/outpatient.*A00/i);
    expect(byCode('B00')[3]).toMatch(/MRI.*not B00/i);
    expect(byCode('M00')[1]).toBe('Dentist');
    expect(byCode('M00')[2]).toMatch(/anything dental.*dental emergency at the ER/i);
    expect(byCode('C12')[1]).toBe('Hospitalization');
    expect(byCode('C12')[3]).toMatch(/routine daily doctor fees.*B00/i);
    expect(rows.find((x) => x[0] === 'TBC' && x[1] === 'Dentist')).toBeUndefined();
    for (const name of ['Specialist consultation', 'Laboratory examinations', 'MRI', 'CT scan', 'X-ray']) {
      const r = rows.find((x) => x[0] === 'TBC' && x[1] === name);
      expect(r, name).toBeDefined();
      expect(r!.slice(2).every((cell) => cell === '—'), name).toBe(true);
    }
    const examples: string[] = [];
    walk(doc, (n) => { if (n.type === 'listItem') examples.push(text(n)); });
    const ex = (re: RegExp) => examples.find((e) => re.test(e)) ?? '';
    expect(ex(/USD 500 ER.*USD 1,500 CT/)).toMatch(/B01/);
    expect(ex(/urgent care.*X-ray/i)).toMatch(/A01/);
    expect(ex(/MRI/)).toMatch(/not B00/);
    expect(ex(/daily doctor visits/)).toMatch(/B00.*C12/);
    expect(ex(/ER doctor's bill/)).toMatch(/A00.*Dental emergency at the ER: M00, not B01/);
    expect(text(doc)).toContain('codes marked TBC are not yet confirmed');
  });

  it('search finds it by title and by code', async () => {
    for (const q of ['global codes', 'B01', 'C12', 'A00', 'M00']) {
      const r = await c.req(c.viewer, 'GET', `/api/search?q=${encodeURIComponent(q)}`);
      const titles = (r.body.groups as { hits: { title: string }[] }[]).flatMap((g) => g.hits.map((h) => h.title));
      expect(titles, q).toContain(TITLE);
    }
  });
});

describe('Bank details for international wires: Americas', () => {
  const TITLE = 'Bank details for international wires: Americas';
  const text = (n: PmNode) => { let t = ''; walk(n, (x) => { if (x.text) t += x.text; }); return t; };
  type Sec = { title: string; node: PmNode; rows: string[][]; request: string; text: string };
  let row: { content: string; status: string; category_id: string; content_text: string };
  let secs: Sec[] = [];
  const sec = (start: string) => secs.find((s) => s.title.startsWith(start))!;
  beforeAll(() => {
    row = all<typeof row>('select content, status, category_id, content_text from articles where title = ?', TITLE)[0]!;
    const doc = JSON.parse(row.content) as PmNode;
    secs = doc.content!.filter((n) => n.type === 'collapsible').map((node) => {
      const rows: string[][] = [];
      walk(node, (n) => { if (n.type === 'tableRow') rows.push(n.content!.map(text)); });
      let request = '';
      walk(node, (n) => { if (n.type === 'codeBlock') request = text(n); });
      return { title: String(node.attrs!.title), node, rows, request, text: text(node) };
    });
  });

  it('is published and DEMO-labelled in Finance / Bank information', () => {
    expect(row.status).toBe('published');
    const cat = all<{ name: string; parent: string }>('select c.name, p.name parent from categories c join categories p on p.id = c.parent_id where c.id = ?', row.category_id)[0];
    expect(cat).toEqual({ name: 'Bank information', parent: 'Finance & Payment Processing' });
    expect(row.content).toContain('DEMO content');
    expect(row.content).toContain('Last checked: 2026-11-04');
    expect(row.content_text.length).toBeLessThan(500_000);
  });

  it('has one collapsible per entry, A to Z, territories labelled', () => {
    expect(AMERICAS_BANKS).toHaveLength(55);
    expect(secs).toHaveLength(55);
    const titles = secs.map((s) => s.title);
    expect(titles).toEqual([...titles].sort((x, y) => x.localeCompare(y, 'en')));
    for (const t of ['Brazil', 'Mexico', 'Barbados', 'Puerto Rico (territory of the United States)', 'Curaçao (territory of the Netherlands)', 'Greenland (territory of Denmark)'])
      expect(titles, t).toContain(t);
  });

  it('Brazil, Mexico and Barbados carry their key fields and a request in the local language', () => {
    const br = sec('Brazil');
    expect(br.rows.some((r) => r[0] === 'IBAN')).toBe(true);
    expect(br.rows.some((r) => r[0]!.startsWith('CPF / CNPJ'))).toBe(true);
    expect(br.request).toMatch(/Prezados/);
    expect(br.request).toMatch(/dados bancários/);
    const mx = sec('Mexico');
    expect(mx.rows.find((r) => r[0] === 'CLABE')?.[1]).toBe('18 digits');
    expect(mx.request).toMatch(/Estimados/);
    expect(mx.request).toMatch(/datos bancarios/);
    expect(sec('Barbados').request).toMatch(/Dear .*\n[\s\S]*bank details/);
    expect(sec('Haiti').request).toMatch(/coordonnées bancaires/);
    expect(sec('Suriname').request).toMatch(/bankgegevens/);
    expect(sec('Greenland').request).toMatch(/bankoplysninger/);
  });

  it('lists every field in the table and in the request; unconfirmed fields are never "Required"', () => {
    for (const e of AMERICAS_BANKS) {
      const s = secs.find((x) => x.title.startsWith(e.name))!;
      expect(s, e.name).toBeDefined();
      expect(s.rows.length - 1, e.name).toBe(e.fields.length);
      expect(s.request.split('\n').filter((l) => l.startsWith('- ')).length, e.name).toBe(e.fields.length);
      for (const f of e.fields) {
        const r = s.rows.find((x) => x[0] === f.label)!;
        expect(r, `${e.name} ${f.label}`).toBeDefined();
        if (f.confidence === 'unconfirmed') { expect(r[2]).toBe('Unconfirmed — ask if available'); expect(r[3]).not.toBe(''); }
        else expect(r[2]).toBe({ required: 'Required', recommended: 'Recommended', 'if available': 'If available' }[f.required]);
      }
    }
  });

  it('applies the controller rulings: ask for both IBAN and account number where sources conflict; sanctions note kept', () => {
    for (const n of ['Costa Rica', 'Dominican Republic', 'Honduras', 'Nicaragua', 'Saint Lucia']) {
      const s = sec(n);
      for (const label of ['IBAN', 'Beneficiary account number']) expect(s.rows.find((r) => r[0] === label)?.[3], `${n} ${label}`).toMatch(/ask for both the IBAN and the account number/i);
    }
    expect(sec('Cuba').text).toMatch(/Check compliance before any payment/);
    expect(sec('Venezuela').text).toMatch(/check compliance before any payment/);
  });

  it('links every source over https', () => {
    for (const s of secs) {
      const hrefs: string[] = [];
      walk(s.node, (n) => n.marks?.forEach((m) => { if (m.type === 'link') hrefs.push(String(m.attrs!.href)); }));
      expect(hrefs.length, s.title).toBeGreaterThan(0);
      for (const h of hrefs) {
        expect(new URL(h).protocol, `${s.title} ${h}`).toBe('https:');
        expect(safeHref(h), `${s.title} ${h}`).toBe(h);
      }
    }
  });

  it('matches an independent golden for spot-checked countries (rendered article)', () => {
    const r = (s: string, label: string) => sec(s).rows.find((x) => x[0] === label);
    expect(r('Mexico', 'CLABE')?.slice(1, 3)).toEqual(['18 digits', 'Required']);
    expect(r('Brazil', 'IBAN')?.[2]).toBe('Required');
    expect(r('Brazil', 'CPF / CNPJ (beneficiary tax ID)')?.slice(1, 3)).toEqual(['CPF 11 digits (individuals); CNPJ 14 digits (companies)', 'Required']);
    expect(r('Costa Rica', 'IBAN')?.slice(1, 3)).toEqual(['CR + 20 chars (22 total)', 'Required']);
    expect(r('Costa Rica', 'IBAN')?.[3]).toMatch(/ask for both the IBAN and the account number/);
    expect(r('Venezuela', 'Account number format')?.slice(1, 3)).toEqual(['20 digits (first 4 = bank code)', 'Unconfirmed — ask if available']);
    expect(r('Venezuela', 'RIF / Cedula (beneficiary tax ID)')?.[2]).toBe('Unconfirmed — ask if available');
    expect(r('Greenland', 'IBAN')?.slice(1, 3)).toEqual(['GL + 16 chars (18 total)', 'Required']);
    expect(sec('Cuba').text).toMatch(/Cuba is subject to US sanctions.*Check compliance before any payment/);
    expect(r('Canada', 'Bank transit (branch) number')?.slice(1, 3)).toEqual(['5 digits', 'Required']);
    expect(r('Canada', 'Institution number')?.slice(1, 3)).toEqual(['3 digits', 'Required']);
  });

  it('search finds it by CLABE and by Brazil', async () => {
    for (const q of ['CLABE', 'Brazil']) {
      const r = await c.req(c.viewer, 'GET', `/api/search?q=${encodeURIComponent(q)}`);
      const titles = (r.body.groups as { hits: { title: string }[] }[]).flatMap((g) => g.hits.map((h) => h.title));
      expect(titles, q).toContain(TITLE);
    }
  });
});

describe('EDI & Automation: real procedure from the EDI 101 reference', () => {
  const text = (n: PmNode) => { let t = ''; walk(n, (x) => { if (x.text) t += x.text; if (x.type === 'internalLink') t += String(x.attrs!.label); }); return t; };
  const doc = (title: string) => {
    const row = all<{ content: string }>("select content from articles where title = ? and status = 'published'", title)[0];
    expect(row, title).toBeDefined();
    return JSON.parse(row!.content) as PmNode;
  };
  const rowsOf = (n: PmNode) => { const rows: string[][] = []; walk(n, (x) => { if (x.type === 'tableRow') rows.push(x.content!.map(text)); }); return rows; };
  const images = (n: PmNode) => { const out: PmNode[] = []; walk(n, (x) => { if (x.type === 'image') out.push(x); }); return out; };

  it('the old fictional EDI articles are gone from the seed; the new set is in the right categories with no DEMO wording', () => {
    for (const t of EDI_OLD) expect(SEED_ARTICLES.find((a) => a.title === t), t).toBeUndefined();
    for (const [t, cat] of EDI_REAL) {
      const a = SEED_ARTICLES.find((x) => x.title === t);
      expect(a?.category, t).toBe(cat);
      expect(JSON.stringify(a!.fields ?? {}), t).not.toMatch(/DEMO|fictional/i);
    }
  });

  it('the denial-code table holds the 13 most common codes with their descriptions', () => {
    const rows = rowsOf(doc('EDI denial codes'));
    expect(rows[0]).toEqual(['Code', 'Description', 'When to use']);
    expect(rows.slice(1).map((r) => r.slice(0, 2))).toEqual([
      ['716', 'Invoice paid by member'], ['716', 'Member must pay and claim'], ['716', 'Processed in house'],
      ['556', 'Exceeds benefit maximum / limit'], ['610', 'Routine care not covered'], ['947', 'Not a covered service'],
      ['964', 'Pre-existing'], ['001', 'Requested member information'], ['028', "Before member's coverage"],
      ['033', "After member's coverage terminated"], ['005', 'Request Medicare EOB'], ['011', 'Request primary insurance EOB'], ['902', 'Duplicate'],
    ]);
    expect(rows.find((r) => r[1] === 'Processed in house')![2]).toMatch(/two separate benefit plans/);
    expect(rows.find((r) => r[0] === '902')![2]).toMatch(/previously processed claim/);
  });

  it('the import article names all three checks in order and where each failure goes', () => {
    const rows = rowsOf(doc('Importing EDI invoices into Globo: the three checks'));
    expect(rows.slice(1).map((r) => r[0])).toEqual(['1. Member ID', '2. Diagnosis', '3. GOP']);
    expect(rows[1]![2]).toMatch(/automatically denied/);
    expect(rows[2]![1]).toMatch(/open case with the same diagnosis/);
    expect(rows[2]![2]).toMatch(/Missing Claim/);
    expect(rows[3]![1]).toMatch(/same service dates from and to.*Tax ID/);
    expect(rows[3]![2]).toMatch(/Missing GOP/);
  });

  it('EDI 101 explains the three files and the twelve-step loop with a diagram', () => {
    const d = doc('EDI 101: the three files and the loop');
    expect(rowsOf(d).slice(1).map((r) => r[0])).toEqual(['837', 'PCF', '835']);
    const lists = d.content!.filter((n) => n.type === 'orderedList');
    expect(lists).toHaveLength(1);
    const items = lists[0]!.content!.map(text);
    expect(items).toHaveLength(12);
    expect(items[0]).toBe('Patient receives assistance.');
    expect(items[6]).toMatch(/EC retrieves the file and imports it into Globo/);
    expect(items[8]).toMatch(/Pay to Settled.*PCF/);
    expect(items[11]).toBe('Payment is issued to the provider.');
    expect(images(d).map((n) => n.attrs!.alt)).toEqual([expect.stringMatching(/UHCG.*MacroHealth.*Euro-Center/)]);
    expect(text(d)).toMatch(/PCF_MH_ERCT_20240905065598\.txt/);
  });

  it('the web.transformer pages carry the real rules', () => {
    const mc = text(doc('web.transformer: Missing Claim'));
    for (const s of ['Diagnosis code mismatch', 'Wrong claim provided', 'Treatment outside of policy period', 'Ctrl + F', 'Client #', 'Prague or Bangkok', 'Exact', 'Claim Number', 'Update'])
      expect(mc, s).toContain(s);
    const gop = text(doc('web.transformer: Missing GOP'));
    expect(gop).toMatch(/service dates shown on the invoice/);
    expect(gop).toMatch(/Exact/);
    expect(gop).toMatch(/allowed amount after savings.*not the billed amount/);
    const ae = text(doc('web.transformer: All Entries'));
    expect(ae).toMatch(/without the 909000 prefix/);
    expect(ae).toMatch(/claim source fee invoice ID/);
    expect(ae).toMatch(/claim broker fee invoice ID/);
    expect(ae).toMatch(/2024\/09\/05/);
    const mh = rowsOf(doc('web.transformer: Manual Handling')).slice(1);
    expect(mh.map((r) => r[0])).toEqual(['Missing Tax ID', 'Missing address', 'Missing diagnosis']);
    expect(mh[0]![1]).toMatch(/Vat ID field in the Finance tab/);
    expect(mh[1]![1]).toMatch(/city, state, country, zip or street/);
  });

  it('adjudication covers the three reductions, the denial steps and the three MRR conditions', () => {
    const d = doc('Adjudicating an EDI invoice: reductions, denials and MRR');
    expect(rowsOf(d).slice(1).map((r) => r[0])).toEqual(['Co-payment', 'Deductible', 'Maximum amount']);
    const t = text(d);
    expect(t).toMatch(/Most common in Swedish policies/);
    expect(t).toMatch(/not covered/);
    expect(t).toMatch(/Delete the savings/);
    expect(t).toMatch(/3-digit denial code in the internal remarks/);
    const lists: string[] = []; walk(d, (n) => { if (n.type === 'bulletList') lists.push(n.content!.map(text).join(' | ')); });
    expect(lists).toContain('Invoice status is Pending | MRR is in the internal remark | The line is On Hold');
  });

  it('changing a coverage decision covers both directions with the right batch rule, reprocessing and verification', () => {
    const d = doc('Changing a coverage decision on an EDI invoice');
    expect(d.content!.filter((n) => n.type === 'heading').map(text)).toEqual(['Denied, now to be paid', 'Paid, now to be denied', 'Reprocessing', 'Verification']);
    const steps = d.content!.filter((n) => n.type === 'steps').map((s) => s.content!.map((x) => `${x.attrs!.title}: ${text(x)}`).join(' | '));
    expect(steps).toHaveLength(2);
    expect(steps[0]).toMatch(/refund and create a copy/);
    expect(steps[0]).toMatch(/Message WKN with the UHAP ID and invoice date/);
    expect(steps[0]).toMatch(/both the negative and the positive line in the same batch/);
    expect(steps[0]).not.toMatch(/different batch/);
    expect(steps[1]).toMatch(/void them if still pending.*automatic refund if already settled/);
    expect(steps[1]).toMatch(/automatic refund and create a copy/);
    expect(steps[1]).toMatch(/UHCG – United Health Care Global – Refunds Overpayments Reporting/);
    expect(steps[1]).not.toMatch(/same batch/);
    const t = text(d);
    expect(t).toMatch(/Same-batch grouping applies only here/);
    expect(t).toMatch(/Negative and positive go in different batches/);
    expect(t).toMatch(/Reprocess Invoice.*UHAP ID.*Reprocess/);
    expect(t).toMatch(/Cancelled.*claim replacement ID/);
    expect(images(d).map((n) => n.attrs!.alt)).toEqual([expect.stringMatching(/182.*Not covered.*0\.00.*120\.00/)]);
  });

  it('no seed article still describes the retired fictional EDI pipeline; the missing-GOP work instruction points at the real page', () => {
    for (const a of published()) expect(a.content, a.title).not.toMatch(/E-112|NO_GOP|Retry match|EDI Gateway|EDI Monitor|from quarantine|quarantined (EDI )?claim|999 within/);
    const gop = text(doc('Request a missing GOP'));
    expect(gop).toContain('web.transformer: Missing GOP');
  });

  it('matches the reference screenshots: Reductions tab rows, Reprocess Invoice wording', () => {
    expect(text(doc('Adjudicating an EDI invoice: reductions, denials and MRR'))).toContain(
      'Initial amount, Other, Number of Treatments, Deductible (in %), Deductible (in % with max amount), Co Payment, Deductible, Co Insurance, Maximum amount and Pay');
    const t = text(doc('Changing a coverage decision on an EDI invoice'));
    expect(t).toMatch(/Go to Reprocess Invoice, search the UHAP ID/);
    expect(t).not.toMatch(/In web\.transformer go to/);
  });

  it('headings never skip a level in the EDI articles', () => {
    for (const [t] of EDI_REAL) {
      let last = 1;
      walk(doc(t), (n) => { if (n.type === 'heading') { const l = n.attrs!.level as number; expect(l - last, `${t}: h${last} -> h${l}`).toBeLessThanOrEqual(1); last = l; } });
    }
  });
});

describe('re-seed refreshes a stale search index without new revisions', () => {
  const TITLE = 'Bank details for international wires: Americas';
  let u: Ctx;
  const one = <T>(sql: string, ...args: unknown[]) => u.app.sqlite.prepare(sql).get(...args) as T;
  const found = async (q: string) => {
    const r = await u.req(u.viewer, 'GET', `/api/search?q=${encodeURIComponent(q)}`);
    return (r.body.groups as { hits: { title: string }[] }[]).flatMap((g) => g.hits.map((h) => h.title)).includes(TITLE);
  };
  beforeAll(async () => {
    u = await setup(mkdtempSync(join(tmpdir(), 'ops-seed-fts-')));
    await seedDemo(u.app);
  });

  it('re-indexes an article whose content_text predates the extractor change; revision counts unchanged', async () => {
    const { id } = one<{ id: string }>('select id from articles where title = ?', TITLE);
    const revs = () => one<{ n: number }>('select count(*) n from revisions').n;
    const mine = () => one<{ n: number }>('select count(*) n from revisions where article_id = ?', id).n;
    const before = [revs(), mine()];
    u.app.sqlite.prepare("update articles set content_text = 'stale' where id = ?").run(id);
    indexArticle(u.app.sqlite, id);
    expect(await found('Brazil')).toBe(false);
    await seedDemo(u.app);
    expect(await found('Brazil')).toBe(true);
    await seedDemo(u.app);
    expect([revs(), mine()]).toEqual(before);
  });
});

describe('re-seed updates the Global codes article in an existing database', () => {
  const TITLE = 'Global codes for invoice processing';
  let u: Ctx;
  beforeAll(async () => {
    u = await setup(mkdtempSync(join(tmpdir(), 'ops-seed-gc-')));
    await seedDemo(u.app);
  });

  it('replaces older seeded content (before A00/M00) with the current rows', async () => {
    const content = () => (u.app.sqlite.prepare('select content from articles where title = ?').get(TITLE) as { content: string }).content;
    // simulate a database seeded before the A00/M00 rulings
    u.app.sqlite.prepare('update articles set content = ? where title = ?').run(content().replaceAll('M00', 'TBC').replaceAll('A00', 'TBC'), TITLE);
    expect(content()).not.toContain('M00');
    await seedDemo(u.app);
    expect(content()).toContain('M00');
    expect(content()).toContain('A00');
  });
});

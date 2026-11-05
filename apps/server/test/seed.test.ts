import { describe, it, expect, beforeAll } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ARTICLE_TYPES, PM_NODES, PM_MARKS, type PmNode } from '@ops/shared';
import { setup, type Ctx } from './helpers';
import { seedDemo, CATEGORY_TREE } from '../src/seed/base';
import { SEED_ARTICLES } from '../src/seed/content/articles';

const REIMB = 'Reimbursement: from document intake to proof of payment';
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
    expect(all('select id from flows')).toHaveLength(3);
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

describe('category restructure', () => {
  it('has the 8 top-level categories with the moved subcategories', () => {
    const tree = Object.fromEntries(CATEGORY_TREE.map((t) => [t.name, t.children]));
    expect(Object.keys(tree)).toEqual(['EDI & Automation', 'Clients & Terms and Conditions', 'Work Instructions', 'Quality Assurance',
      'Provider Networks & Partners', 'Finance & Payment Processing', 'Internal Systems', 'Glossary & Acronyms']);
    expect(tree['EDI & Automation']).toContain('EDI issues');
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
    for (const t of ['EDI claim failed to import', '999 rejected a whole batch (IK5*R)', 'MacroHealth file not picked up']) expect(cat(t), t).toBe('EDI & Automation / EDI issues');
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
  ];
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
    }
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
    for (const s of ['approve-a-claim-for-payment', 'handling-medical-records-requests', 'process-a-member-reimbursement', 'bluefin-corporate-health-coverage-summary'])
      expect(art(s)?.status, s).toBe('archived');
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
});

describe('full DEMO terms and conditions', () => {
  const common = [/^\d+\. Definitions/, /Eligibility and territory/, /Period of cover/, /Emergency medical expenses/, /Pre-existing medical conditions/,
    /vaccinations/i, /Medical evacuation and repatriation/, /Repatriation of mortal remains/, /Pregnancy and childbirth/, /Mental health/,
    /Dental emergency/, /Prescription medication/, /Guarantee of payment/, /Claims procedure/, /Luggage.*personal belongings/,
    /Personal money and documents/, /Compassionate visit/, /General exclusions/, /General conditions/, /Fraud/, /Subrogation/,
    /Other insurance/, /Sanctions/, /Complaints/, /Governing law/, /How to contact assistance/];
  const cases: [string, string, RegExp[]][] = [
    ['Wayfarer Family Travel Plan: policy terms and conditions', 'Clients & Terms and Conditions / Travel insurance clients',
      [/Trip cancellation/, /Curtailment/, /Travel delay/, /Personal liability/, /Accompanying child/]],
    ['Bluefin Corporate Health: full terms and conditions', 'Clients & Terms and Conditions / Corporate clients',
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
    for (const s of ['A01', 'B01', 'B00', 'C12', 'purpose of the visit']) expect(row.content, s).toContain(s);
    const text = (n: PmNode) => { let t = ''; walk(n, (x) => { if (x.text) t += x.text; }); return t; };
    const doc = JSON.parse(row.content) as PmNode;
    const rows: string[][] = [];
    walk(doc, (n) => { if (n.type === 'tableRow') rows.push(n.content!.map(text)); });
    const byCode = (k: string) => rows.find((r) => r[0] === k)!;
    expect(byCode('A01')[1]).toBe('Consultation');
    expect(byCode('A01')[2]).toMatch(/urgent care/i);
    expect(byCode('B01')[1]).toMatch(/Emergency department \(ER\)/);
    expect(byCode('B00')[1]).toBe('Medical fees');
    expect(byCode('B00')[2]).toMatch(/only surgeries and operations/i);
    expect(byCode('B00')[3]).toMatch(/any other doctor fee.*MRI.*not B00/i);
    expect(byCode('C12')[1]).toBe('Hospitalization');
    expect(byCode('C12')[3]).toMatch(/routine daily doctor fees.*B00/i);
    for (const name of ['Specialist consultation', 'Dentist', 'Laboratory examinations', 'MRI', 'CT scan', 'X-ray']) {
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
    expect(text(doc)).toContain('codes marked TBC are not yet confirmed');
  });

  it('search finds it by title and by code', async () => {
    for (const q of ['global codes', 'B01', 'C12']) {
      const r = await c.req(c.viewer, 'GET', `/api/search?q=${encodeURIComponent(q)}`);
      const titles = (r.body.groups as { hits: { title: string }[] }[]).flatMap((g) => g.hits.map((h) => h.title));
      expect(titles, q).toContain(TITLE);
    }
  });
});

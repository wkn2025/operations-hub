import type { FastifyInstance } from 'fastify';
import { and, eq } from 'drizzle-orm';
import { readFile } from 'node:fs/promises';
import { resolve as resolvePath } from 'node:path';
import type { PmNode, Role, User } from '@ops/shared';
import { articles, categories, editorAllowlist, files, flows, users } from '../db/schema';
import { createFlow, transitionFlow, updateFlow } from '../services/flows';
import { SEED_FLOWS } from './content/flows';
import { createArticle, reindexCategorySubtree, slugify, transition, uniqueSlug, updateArticle } from '../services/articles';
import { storeFile } from '../services/files';
import { extractText } from '../services/pm-text';
import { indexArticle } from '../services/search';
import { DEMO_USERS } from '../auth/dev';
import { SEED_ARTICLES } from './content/articles';
import { ediMonitorSvg } from './screenshots/edi-monitor.svg';
import { globoCaseSvg } from './screenshots/globo-case.svg';
import { ecnetPaymentRunSvg } from './screenshots/ecnet-payment-run.svg';
import { macroHealthPortalSvg } from './screenshots/macrohealth-portal.svg';
import { claimLifecycleSvg } from './screenshots/claim-lifecycle.svg';

/** The eight top-level categories with their demo subcategories (restructured 2026-10-30, was nine). */
export const CATEGORY_TREE: { name: string; description: string; children: string[] }[] = [
  { name: 'EDI & Automation', description: 'Electronic claim exchange, acknowledgements and the automations around them.', children: ['Inbound claims (837)', 'Acknowledgements (999/277)', 'Automation scripts', 'EDI issues'] },
  { name: 'Clients & Terms and Conditions', description: 'Who our clients are and what each contract lets us authorise.', children: ['Travel insurance clients', 'Corporate clients', 'Coverage summaries'] },
  { name: 'Work Instructions', description: 'Step-by-step procedures for recurring operational tasks.', children: ['Case handling', 'Invoice processing', 'Reimbursements'] },
  { name: 'Quality Assurance', description: 'Checks, sampling and sign-offs that keep claims and payments right first time.', children: ['Quality checks', 'Audit & sampling'] },
  { name: 'Provider Networks & Partners', description: 'Hospitals, clinics and assistance partners we work with.', children: ['Hospital network', 'Assistance partners'] },
  { name: 'Finance & Payment Processing', description: 'Payment runs, currencies, fees and reconciliation.', children: ['Payment runs', 'Currency & fees', 'Reconciliation', 'Payment issues', 'Global codes', 'Bank information'] },
  { name: 'Internal Systems', description: 'Globo, ECNet and the other tools we run on.', children: ['Globo', 'ECNet', 'Access & permissions'] },
  { name: 'Glossary & Acronyms', description: 'The terms and abbreviations used across operations.', children: ['EDI terms', 'Medical terms'] },
];

/**
 * In-place upgrade of a database seeded with the old nine-category tree (demo seed only).
 * Moves keep the category id, so articles follow: [old parent, name, new parent].
 */
const LEGACY_MOVES: [string, string, string][] = [
  ['Troubleshooting Center', 'EDI issues', 'EDI & Automation'],
  ['Troubleshooting Center', 'Payment issues', 'Finance & Payment Processing'],
  ['Work Instructions', 'Quality checks', 'Quality Assurance'],
  ['Claims & Reimbursements', 'Reimbursements', 'Work Instructions'],
];
/** Legacy rows archived once empty; children before parents (same rule as PATCH /api/categories, 409 otherwise). */
const LEGACY_ARCHIVE: [string | null, string][] = [
  ['Claims & Reimbursements', 'Claim intake'], ['Claims & Reimbursements', 'Medical records'],
  [null, 'Claims & Reimbursements'], [null, 'Troubleshooting Center'],
];
/** Demo articles retired by merges or removals: archived, never deleted, so their history stays. */
const RETIRED_SLUGS = [
  'approve-a-claim-for-payment', 'process-a-member-reimbursement', 'send-a-medical-records-request',
  'invoice-denial-reasons-and-how-to-explain-them', 'handling-medical-records-requests',
  'bluefin-corporate-health-coverage-summary', 'atlas-student-travel-cover-coverage-summary', 'harbor-cruise-assist-coverage-summary',
];

const SEED_FILES: Record<string, { mime: string; data: () => Buffer }> = {
  'edi-monitor.svg': { mime: 'image/svg+xml', data: () => Buffer.from(ediMonitorSvg, 'utf8') },
  'globo-case.svg': { mime: 'image/svg+xml', data: () => Buffer.from(globoCaseSvg, 'utf8') },
  'ecnet-payment-run.svg': { mime: 'image/svg+xml', data: () => Buffer.from(ecnetPaymentRunSvg, 'utf8') },
  'macrohealth-portal.svg': { mime: 'image/svg+xml', data: () => Buffer.from(macroHealthPortalSvg, 'utf8') },
  'claim-lifecycle.svg': { mime: 'image/svg+xml', data: () => Buffer.from(claimLifecycleSvg, 'utf8') },
};

type App = FastifyInstance;
const now = () => new Date().toISOString();

function ensureUser(app: App, email: string, name: string, role: Role): User {
  const row = app.db.select().from(users).where(eq(users.email, email)).get();
  if (row) return { id: row.id, email, name: row.name, role: row.role };
  const u = { id: crypto.randomUUID(), email, name, role };
  // admin is pinned (role_set_by_admin) so it stays admin even without ADMIN_BOOTSTRAP_EMAILS in .env
  app.db.insert(users).values({ ...u, roleSetByAdmin: role === 'admin', createdAt: now() }).run();
  return u;
}

function ensureCategory(app: App, name: string, parentId: string | null, sortOrder: number, description: string | null) {
  const all = app.db.select().from(categories).all();
  const hit = all.find((c) => c.name === name && c.parentId === parentId);
  if (hit) return hit.id;
  const id = crypto.randomUUID();
  app.db.insert(categories).values({ id, name, parentId, description, sortOrder, slug: uniqueSlug(app.sqlite, 'categories', name), createdAt: now() }).run();
  return id;
}

/** Reuse only a file the seed itself stored (same name, uploaded by the seed admin, identical bytes). */
async function ensureFile(app: App, admin: User, key: string) {
  const f = SEED_FILES[key];
  if (!f) throw new Error(`unknown seed file ${key}`);
  const name = `demo-${key}`, data = f.data();
  for (const row of app.db.select().from(files).where(and(eq(files.name, name), eq(files.uploadedBy, admin.id))).all()) {
    const bytes = await readFile(resolvePath(app.config.dataDir, 'uploads', row.path)).catch(() => null);
    if (bytes?.equals(data)) return row.id;
  }
  return (await storeFile(app, admin, name, f.mime, data)).id;
}

/** The demo seed creates well-known demo accounts; never let it run against a real deployment by accident. */
export function seedAllowed(env: Record<string, string | undefined>, argv: string[]) {
  if (argv.includes('--force-demo') || argv.includes('--categories-only')) return;
  if (env.NODE_ENV === 'production' || env.AUTH_MODE === 'oidc')
    throw new Error('Seed refused: NODE_ENV=production or AUTH_MODE=oidc. Pass --force-demo to seed demo data anyway.');
}

/** Production-safe: only the eight top-level categories (no demo users, articles or subcategories). Idempotent. */
export function seedCategories(app: App) {
  app.sqlite.transaction(() => CATEGORY_TREE.forEach((t, i) => ensureCategory(app, t.name, null, i, t.description)))();
}

/** Idempotent base seed: categories, demo users, editor allowlist, DEMO articles (upsert by slug, published). */
export async function seedBase(app: App) {
  const byRole = Object.fromEntries((['admin', 'editor', 'viewer'] as const).map((r) => {
    const d = DEMO_USERS.find((u) => u.email.startsWith(r))!;
    return [r, ensureUser(app, d.email, d.name, r)];
  })) as Record<Role, User>;
  app.db.insert(editorAllowlist).values({ email: byRole.editor.email, addedBy: byRole.admin.id, createdAt: now() }).onConflictDoNothing().run();

  const catIds = new Map<string, string>();
  app.sqlite.transaction(() => {
    const tops = CATEGORY_TREE.map((t, i) => ensureCategory(app, t.name, null, i, t.description));
    moveLegacyCategories(app);
    CATEGORY_TREE.forEach((t, i) => {
      catIds.set(t.name, tops[i]!);
      t.children.forEach((c, j) => catIds.set(`${t.name} / ${c}`, ensureCategory(app, c, tops[i]!, j, null)));
    });
  })();

  const fileIds = new Map<string, string>();
  const ids = new Map<string, string>(); // title -> id
  for (const d of SEED_ARTICLES) {
    const row = app.db.select().from(articles).where(eq(articles.slug, slugify(d.title))).get();
    ids.set(d.title, row?.id ?? createArticle(app, byRole[d.owner], { title: d.title, type: d.type, categoryId: catIds.get(d.category) }));
    for (const key of collect(d.content, 'seedFile')) if (!fileIds.has(key)) fileIds.set(key, await ensureFile(app, byRole.admin, key));
  }

  for (const d of SEED_ARTICLES) {
    const id = ids.get(d.title)!;
    const categoryId = catIds.get(d.category);
    if (!categoryId) throw new Error(`unknown category "${d.category}" in seed article "${d.title}"`);
    const content = { type: 'doc', content: resolve(d.content, ids, fileIds) };
    const fields: Record<string, unknown> = { ...d.fields };
    const cur = app.db.select().from(articles).where(eq(articles.id, id)).get()!;
    const tags = (app.sqlite.prepare('select t.name from article_tags x join tags t on t.id = x.tag_id where x.article_id = ? order by t.name').all(id) as { name: string }[]).map((t) => t.name);
    const same = cur.content === JSON.stringify(content) && cur.fields === JSON.stringify(fields) && cur.type === d.type
      && cur.categoryId === categoryId && (cur.reviewDate ?? undefined) === d.reviewDate && tags.join() === d.tags.map((t) => t.toLowerCase()).sort().join(); // tags are stored lowercased
    if (!same) {
      updateArticle(app, byRole.admin, id, { baseRevision: cur.revision, content, fields, type: d.type, categoryId, tags: d.tags, reviewDate: d.reviewDate ?? null, note: 'seed' });
    }
    if (cur.status !== 'published') transition(app, byRole.admin, id, cur.status === 'archived' ? 'restore' : 'publish');
    if (cur.status === 'archived') transition(app, byRole.admin, id, 'publish');
  }
  retireLegacy(app, byRole.admin);
  seedFlows(app, byRole.admin);
  refreshSearchText(app);
}

/** Unchanged articles are skipped above, so after an extractor change their content_text/FTS would stay stale. No new revision. */
function refreshSearchText(app: App) {
  const rows = app.sqlite.prepare('select id, content, content_text from articles').all() as { id: string; content: string; content_text: string }[];
  const set = app.sqlite.prepare('update articles set content_text = ? where id = ?');
  app.sqlite.transaction(() => {
    for (const r of rows) {
      const t = extractText(JSON.parse(r.content));
      if (t !== r.content_text) { set.run(t, r.id); indexArticle(app.sqlite, r.id); }
    }
  })();
}

/** Active category by (parent name or null for top level, name). */
function findCategory(app: App, parent: string | null, name: string) {
  const all = app.db.select().from(categories).all().filter((c) => !c.archived);
  const parentId = parent === null ? null : all.find((c) => c.name === parent && !c.parentId)?.id;
  return parentId === undefined ? undefined : all.find((c) => c.name === name && c.parentId === parentId);
}

function moveLegacyCategories(app: App) {
  for (const [from, name, to] of LEGACY_MOVES) {
    const row = findCategory(app, from, name), target = findCategory(app, null, to);
    if (!row || !target || findCategory(app, to, name)) continue;
    const sortOrder = CATEGORY_TREE.find((t) => t.name === to)!.children.indexOf(name);
    app.db.update(categories).set({ parentId: target.id, sortOrder }).where(eq(categories.id, row.id)).run();
    reindexCategorySubtree(app, row.id);
  }
}

function retireLegacy(app: App, admin: User) {
  for (const slug of RETIRED_SLUGS) {
    const a = app.db.select().from(articles).where(eq(articles.slug, slug)).get();
    if (a && a.status !== 'archived') transition(app, admin, a.id, 'archive');
  }
  for (const [parent, name] of LEGACY_ARCHIVE) {
    const row = findCategory(app, parent, name);
    if (!row) continue;
    const busy = app.db.select().from(categories).all().some((c) => c.parentId === row.id && !c.archived)
      || app.sqlite.prepare("select 1 from articles where category_id = ? and status <> 'archived'").get(row.id);
    if (busy) { console.warn(`seed: legacy category "${name}" still holds content; left active`); continue; }
    app.db.update(categories).set({ archived: true }).where(eq(categories.id, row.id)).run();
  }
}

/** Plan name for the full demo seed (Task 9); same function. */
export const seedDemo = seedBase;

/** Idempotent: flows are matched by slug; article nodes name a seeded article by slug. */
function seedFlows(app: App, admin: User) {
  const articleId = (slug: string) => {
    const a = app.db.select().from(articles).where(eq(articles.slug, slug)).get();
    if (!a) throw new Error(`seed flow links to unknown article "${slug}"`);
    return a.id;
  };
  for (const d of SEED_FLOWS) {
    const nodes = d.nodes.map(({ articleSlug, ...n }) => (articleSlug ? { ...n, articleId: articleId(articleSlug) } : n));
    const link = d.articleSlug ? articleId(d.articleSlug) : null;
    // also adopts the pre-DEMO-label row (same title without the suffix) so existing databases are renamed, not duplicated
    const row = app.db.select().from(flows).where(eq(flows.slug, slugify(d.title))).get() ?? app.db.select().from(flows).where(eq(flows.slug, slugify(d.title.replace(/ \(DEMO\)$/, '')))).get();
    const id = row?.id ?? createFlow(app, admin, { title: d.title, nodes, startId: d.startId, articleId: link });
    const cur = app.db.select().from(flows).where(eq(flows.id, id)).get()!;
    if (cur.title !== d.title || cur.nodes !== JSON.stringify(nodes) || cur.startId !== d.startId || cur.articleId !== link) updateFlow(app, admin, id, { baseRevision: cur.revision, title: d.title, nodes, startId: d.startId, articleId: link });
    if (cur.status !== 'published') transitionFlow(app, admin, id, cur.status === 'archived' ? 'restore' : 'publish');
    if (cur.status === 'archived') transitionFlow(app, admin, id, 'publish');
  }
}

function collect(nodes: PmNode[], attr: string, out = new Set<string>()) {
  for (const n of nodes) {
    if (typeof n.attrs?.[attr] === 'string') out.add(n.attrs[attr] as string);
    if (n.content) collect(n.content, attr, out);
  }
  return out;
}

/** Replace seed placeholders: internalLink {seedRef: title} -> {articleId}; image {seedFile} -> {src}. */
function resolve(nodes: PmNode[], ids: Map<string, string>, fileIds: Map<string, string>): PmNode[] {
  return nodes.map((n) => {
    let attrs = n.attrs;
    if (n.type === 'internalLink' && typeof attrs?.seedRef === 'string') {
      const { seedRef, ...rest } = attrs;
      const articleId = ids.get(seedRef as string);
      if (!articleId) throw new Error(`seed link to unknown article "${seedRef}"`);
      attrs = { articleId, ...rest };
    }
    if (n.type === 'image' && typeof attrs?.seedFile === 'string') {
      const { seedFile, ...rest } = attrs;
      attrs = { src: `/api/files/${fileIds.get(seedFile as string)}`, ...rest };
    }
    return { ...n, ...(attrs ? { attrs } : {}), ...(n.content ? { content: resolve(n.content, ids, fileIds) } : {}) };
  });
}

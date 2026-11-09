// GitHub Pages snapshot: seeds a throwaway database, reads it through the real API as a viewer (published content only, same
// visibility rules as the server) and writes JSON + files next to the static web build. The web app's static-demo stand-in
// (apps/web/src/static/demoApi.ts) answers its API calls from these files.
//   tsx scripts/pages/snapshot.ts <web dist dir>
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { buildApp } from '../../apps/server/src/app';
import { seedBase } from '../../apps/server/src/seed/base';

const out = resolve(process.argv[2] ?? 'apps/web/dist', 'demo-data');
const dataDir = mkdtempSync(join(tmpdir(), 'ops-hub-pages-'));
const app = await buildApp({
  env: { AUTH_MODE: 'dev', NODE_ENV: 'test', DATA_DIR: dataDir, SESSION_SECRET: 'pages-snapshot-only-pages-snapshot-only', ADMIN_BOOTSTRAP_EMAILS: 'admin@demo.test' },
});

try {
  await seedBase(app);
  const login = await app.inject({ method: 'POST', url: '/api/auth/dev/login', payload: { email: 'pages-visitor@demo.invalid' } });
  if (login.statusCode !== 200) throw new Error(`dev login failed: ${login.statusCode}`);
  const cookie = ([login.headers['set-cookie']].flat()[0] as string).split(';')[0]!;
  const get = async (url: string) => {
    const r = await app.inject({ method: 'GET', url, headers: { cookie } });
    if (r.statusCode !== 200) throw new Error(`GET ${url} -> ${r.statusCode} ${r.body}`);
    return r;
  };
  const getJson = async <T = any>(url: string): Promise<T> => (await get(url)).json() as T;

  rmSync(out, { recursive: true, force: true });
  for (const d of ['article', 'flow', 'files', 'codes']) mkdirSync(join(out, d), { recursive: true });
  const write = (path: string, data: unknown) => writeFileSync(join(out, path), JSON.stringify(data));

  const { categories } = await getJson<{ categories: { id: string; path: string }[] }>('/api/categories');
  const articles: { id: string; slug: string }[] = [];
  for (let total = Infinity; articles.length < total;) {
    const page = await getJson<{ articles: { id: string; slug: string }[]; total: number }>(`/api/articles?limit=200&offset=${articles.length}`);
    total = page.total;
    if (!page.articles.length) break;
    articles.push(...page.articles);
  }
  const { counts } = await getJson('/api/articles/counts');
  const { flows } = await getJson<{ flows: { id: string; slug: string }[] }>('/api/flows');

  // the viewer's ids only, raw from the FTS tables the server searches
  const files = new Set<string>();
  const articleKeys: Record<string, string> = {};
  for (const a of articles) {
    articleKeys[a.id] = a.id; articleKeys[a.slug] = a.id;
    const article = await getJson(`/api/articles/${a.id}`);
    const { files: list } = await getJson<{ files: { id: string }[] }>(`/api/articles/${a.id}/files`);
    const { backlinks } = await getJson(`/api/articles/${a.id}/backlinks`);
    for (const f of list) files.add(f.id);
    for (const m of JSON.stringify(article).matchAll(/\/api\/files\/([A-Za-z0-9-]+)/g)) files.add(m[1]!);
    write(`article/${a.id}.json`, { article, files: list, backlinks });
  }
  const flowKeys: Record<string, string> = {};
  for (const f of flows) {
    flowKeys[f.id] = f.id; flowKeys[f.slug] = f.id;
    write(`flow/${f.id}.json`, await getJson(`/api/flows/${f.id}`));
  }
  // Pages picks the Content-Type from the extension (an SVG without .svg would not render)
  const EXT: Record<string, string> = { 'image/svg+xml': '.svg', 'image/png': '.png', 'image/jpeg': '.jpg', 'image/gif': '.gif', 'image/webp': '.webp', 'application/pdf': '.pdf' };
  const fileNames: Record<string, string> = {};
  for (const id of files) {
    const r = await get(`/api/files/${id}`);
    const type = String(r.headers['content-type']).split(';')[0]!;
    fileNames[id] = id + (EXT[type] ?? '');
    writeFileSync(join(out, 'files', fileNames[id]!), r.rawPayload);
  }

  const visible = new Set(articles.map((a) => a.id));
  const catPath = new Map(categories.map((c) => [c.id, c.path]));
  const index = (app.sqlite.prepare(
    'select f.article_id as id, a.title, a.type, a.category_id as cid, f.body, f.tags, f.category, f.client, f.terms from article_fts f join articles a on a.id = f.article_id',
  ).all() as { id: string; title: string; type: string; cid: string | null; body: string; tags: string; category: string; client: string; terms: string }[])
    .filter((r) => visible.has(r.id))
    .map(({ cid, ...r }) => ({ ...r, categoryPath: cid ? catPath.get(cid) ?? '' : '' }));
  const flowSlugs = new Set(flows.map((f) => f.slug));
  const flowIndex = (app.sqlite.prepare('select f.slug, x.title, x.body from flow_fts x join flows f on f.id = x.flow_id').all() as { slug: string; title: string; body: string }[])
    .filter((r) => flowSlugs.has(r.slug));
  const tagRows = app.sqlite.prepare('select t.id, t.name, x.article_id as aid from tags t join article_tags x on x.tag_id = t.id').all() as { id: string; name: string; aid: string }[];
  const tags = new Map<string, { id: string; name: string; articleIds: string[] }>();
  for (const t of tagRows) if (visible.has(t.aid)) {
    const e = tags.get(t.id) ?? { id: t.id, name: t.name, articleIds: [] };
    e.articleIds.push(t.aid); tags.set(t.id, e);
  }

  write('core.json', {
    snapshotAt: new Date().toISOString(), categories, articles, counts, flows, articleKeys, flowKeys, fileNames,
    search: { articles: index, flows: flowIndex, tags: [...tags.values()] },
  });
  const ref = resolve('apps/server/reference');
  copyFileSync(join(ref, 'icd10cm-2027.tsv.gz'), join(out, 'codes', 'icd10cm-2027.tsv.gz'));
  copyFileSync(join(ref, 'cpt-hcpcs.tsv'), join(out, 'codes', 'cpt-hcpcs.tsv'));
  console.log(`Pages snapshot: ${articles.length} articles, ${flows.length} flows, ${files.size} files, ${categories.length} categories -> ${out}`);
} finally {
  await app.close();
  rmSync(dataDir, { recursive: true, force: true });
}

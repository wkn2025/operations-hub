import { describe, it, expect, beforeEach } from 'vitest';
import { setup, doc, setSetting, env, type Ctx } from './helpers';
import { buildApp } from '../src/app';
import { can } from '../src/auth/policy';

let c: Ctx;
beforeEach(async () => { c = await setup(); });
const mkPub = async () => {
  const a = (await c.req(c.editor, 'POST', '/api/articles', { title: 'P', content: doc('orig') })).body;
  await c.req(c.editor, 'POST', `/api/articles/${a.id}/publish`);
  return a.id as string;
};
const rawSetting = (v: string) =>
  c.app.sqlite.prepare("insert into settings(key,value) values('requireApproval',?) on conflict(key) do update set value=excluded.value").run(v);

describe('requireApproval protects published content', () => {
  it('policy: single source', () => {
    const ed = { id: 'e', email: 'e', name: 'e', role: 'editor' as const };
    const ad = { ...ed, role: 'admin' as const };
    expect(can(ed, 'article:write', { status: 'published' }, { requireApproval: true })).toBe(false);
    expect(can(ed, 'article:write', { status: 'published' }, { requireApproval: false })).toBe(true);
    expect(can(ed, 'article:write', { status: 'draft' }, { requireApproval: true })).toBe(true);
    expect(can(ed, 'article:archive', { status: 'published' }, { requireApproval: true })).toBe(false);
    expect(can(ed, 'article:archive', { status: 'archived' }, { requireApproval: true })).toBe(true);
    expect(can(ad, 'article:write', { status: 'published' }, { requireApproval: true })).toBe(true);
  });
  it('editor PATCH / revision restore / archive of published => 403; admin => 200', async () => {
    const id = await mkPub();
    await c.req(c.editor, 'PATCH', `/api/articles/${id}`, { baseRevision: 1, content: doc('v2') }); // allowed before approval is on
    setSetting(c.app, 'requireApproval', true);
    expect((await c.req(c.editor, 'PATCH', `/api/articles/${id}`, { baseRevision: 2, title: 'X' })).status).toBe(403);
    expect((await c.req(c.editor, 'POST', `/api/articles/${id}/revisions/1/restore`)).status).toBe(403);
    expect((await c.req(c.editor, 'POST', `/api/articles/${id}/archive`)).status).toBe(403);
    expect((await c.req(c.admin, 'PATCH', `/api/articles/${id}`, { baseRevision: 2, title: 'X' })).status).toBe(200);
    expect((await c.req(c.admin, 'POST', `/api/articles/${id}/revisions/1/restore`)).status).toBe(200);
    expect((await c.req(c.admin, 'POST', `/api/articles/${id}/archive`)).status).toBe(200);
  });
  it('editor can still edit drafts and submit under requireApproval', async () => {
    setSetting(c.app, 'requireApproval', true);
    const a = (await c.req(c.editor, 'POST', '/api/articles', { title: 'D' })).body;
    expect((await c.req(c.editor, 'PATCH', `/api/articles/${a.id}`, { baseRevision: 1, title: 'D2' })).status).toBe(200);
    expect((await c.req(c.editor, 'POST', `/api/articles/${a.id}/submit`)).status).toBe(200);
  });
  it('setting parsing is tolerant', async () => {
    const id = await mkPub();
    for (const raw of ['true', '"true"', 'TRUE']) {
      rawSetting(raw);
      expect((await c.req(c.editor, 'POST', `/api/articles/${id}/archive`)).status, raw).toBe(403);
    }
    for (const raw of ['false', 'garbage', '0']) {
      rawSetting(raw);
      const cur = (await c.req(c.editor, 'GET', `/api/articles/${id}`)).body.revision;
      expect((await c.req(c.editor, 'PATCH', `/api/articles/${id}`, { baseRevision: cur, title: 'ok' })).status, raw).toBe(200);
    }
  });
});

describe('integrity', () => {
  it('unique indexes and single connection', () => {
    const uniq = (t: string) => (c.app.sqlite.prepare(`pragma index_list(${t})`).all() as any[]).filter((i) => i.unique).map((i) =>
      (c.app.sqlite.prepare(`pragma index_info(${i.name})`).all() as any[]).map((x) => x.name).join(','));
    expect(uniq('revisions')).toContain('article_id,rev');
    expect(uniq('articles')).toContain('slug');
    expect((c.app.db as any).$client).toBe(c.app.sqlite);
  });
  it('moving into archived category 409; unarchive child under archived parent 409', async () => {
    const mk = async (name: string, parentId?: string) => (await c.req(c.admin, 'POST', '/api/categories', { name, parentId })).body.id;
    const p = await mk('P'); const ch = await mk('Ch', p); const other = await mk('O');
    await c.req(c.admin, 'PATCH', `/api/categories/${other}`, { archived: true });
    const a = (await c.req(c.editor, 'POST', '/api/articles', { title: 'A' })).body;
    expect((await c.req(c.editor, 'PATCH', `/api/articles/${a.id}`, { baseRevision: 1, categoryId: other })).status).toBe(409);
    expect((await c.req(c.editor, 'POST', '/api/articles', { title: 'B', categoryId: other })).status).toBe(409);
    await c.req(c.admin, 'PATCH', `/api/categories/${ch}`, { archived: true });
    await c.req(c.admin, 'PATCH', `/api/categories/${p}`, { archived: true });
    expect((await c.req(c.admin, 'PATCH', `/api/categories/${ch}`, { archived: false })).status).toBe(409);
  });
  it('categories: no active category under an archived parent', async () => {
    const mk = async (name: string, parentId?: string) => (await c.req(c.admin, 'POST', '/api/categories', { name, parentId })).body.id;
    const arch = await mk('Arch'); await c.req(c.admin, 'PATCH', `/api/categories/${arch}`, { archived: true });
    const root = await mk('Root'); const ok = await mk('Ok');
    expect((await c.req(c.admin, 'POST', '/api/categories', { name: 'Kid', parentId: arch })).status).toBe(409);
    expect((await c.req(c.admin, 'PATCH', `/api/categories/${root}`, { parentId: arch })).status).toBe(409);
    await c.req(c.admin, 'PATCH', `/api/categories/${ok}`, { archived: true });
    expect((await c.req(c.admin, 'PATCH', `/api/categories/${ok}`, { archived: false, parentId: arch })).status).toBe(409); // root unarchived + archived parent in one PATCH
    expect((await c.req(c.admin, 'PATCH', `/api/categories/${ok}`, { parentId: arch })).status).toBe(200); // stays archived: allowed
    expect((await c.req(c.admin, 'PATCH', `/api/categories/${root}`, { parentId: ok, name: 'R2' })).status).toBe(409);
  });
  it('raw control chars in body cannot create stray <mark>', async () => {
    const a = (await c.req(c.editor, 'POST', '/api/articles', { title: 'Body ctl', content: doc('foo\u0001bar\u0002 zzq') })).body;
    await c.req(c.editor, 'POST', `/api/articles/${a.id}/publish`);
    const hit = (await c.req(c.viewer, 'GET', '/api/search?q=zzq')).body.groups[0].hits[0];
    expect(hit.snippet).not.toMatch(/[\u0001\u0002]/);
    expect(hit.snippet.match(/<mark>/g)!.length).toBe(1);
    expect(hit.snippet.match(/<\/mark>/g)!.length).toBe(1);
  });
  it('invalid category / reviewDate rejected', async () => {
    expect((await c.req(c.editor, 'POST', '/api/articles', { title: 'x', categoryId: 'nope' })).status).toBe(400);
    expect((await c.req(c.editor, 'POST', '/api/articles', { title: 'x', reviewDate: 'tomorrow' })).status).toBe(400);
    expect((await c.req(c.editor, 'POST', '/api/articles', { title: 'x', reviewDate: '2026-02-30' })).status).toBe(400);
    expect((await c.req(c.editor, 'POST', '/api/articles', { title: 'x', reviewDate: '2026-12-31' })).status).toBe(201);
  });
  it('control chars stripped before indexing', async () => {
    const a = (await c.req(c.editor, 'POST', '/api/articles', { title: 'Ti\u0001tle\u0002 zz', tags: ['zz\u0001g'], fields: { client: 'Ac\u0002me zz' } })).body;
    await c.req(c.editor, 'POST', `/api/articles/${a.id}/publish`);
    const r = await c.req(c.viewer, 'GET', '/api/search?q=zz');
    const hit = r.body.groups.find((g: any) => g.kind === 'article').hits[0];
    expect(hit.snippet).toContain('<mark>');
    expect(hit.snippet).not.toMatch(/[\u0001\u0002]/);
    expect(hit.snippet.match(/<mark>/g)!.length).toBe(hit.snippet.match(/<\/mark>/g)!.length);
  });
  it('unexpected errors give generic 500 JSON, no stack or message', async () => {
    const app = await buildApp({ dbPath: ':memory:', env });
    app.get('/boom', async () => { throw new Error('secret at C:\\srv\\x.ts'); });
    const r = await app.inject({ url: '/boom' });
    expect(r.statusCode).toBe(500);
    expect(r.json()).toEqual({ error: 'internal' });
    const bad = await c.app.inject({ method: 'POST', url: '/api/articles', payload: '{bad', headers: { 'content-type': 'application/json', cookie: c.editor } });
    expect(bad.statusCode).toBe(400);
  });
});

describe('anonymous route sweep', () => {
  // Routes that must answer without a session. Every other registered route has to say 401 to anonymous callers.
  const PUBLIC = new Set(['GET /api/me', 'HEAD /api/me', 'POST /api/auth/logout', 'GET /api/auth/dev/users', 'HEAD /api/auth/dev/users', 'POST /api/auth/dev/login']);
  const routes = (tree: string) => {
    const out: [string, string][] = [], stack: string[] = [];
    for (const line of tree.split('\n')) {
      const m = /^([│├└─ ]*)(\S+) \(([^)]+)\)$/.exec(line.trimEnd());
      if (!m) continue;
      const depth = m[1].length / 4;
      stack.length = depth;
      stack.push(m[2]);
      for (const method of m[3].split(', ')) out.push([method, stack.join('')]);
    }
    return out;
  };
  it('every route outside the public allowlist returns 401 without a session', async () => {
    const all = routes(c.app.printRoutes({ commonPrefix: false }));
    expect(all.length).toBeGreaterThan(40);
    expect(all).toContainEqual(['GET', '/api/articles/:id/revisions/:rev']); // parser sanity
    const open: string[] = [];
    for (const [method, path] of all) {
      if (PUBLIC.has(`${method} ${path}`)) continue;
      const url = path.replace(/:\w+/g, 'x');
      const r = await c.app.inject({ method: method as any, url, ...(['POST', 'PATCH', 'PUT'].includes(method) ? { payload: {} } : {}) });
      if (r.statusCode !== 401) open.push(`${method} ${path} -> ${r.statusCode}`);
    }
    expect(open).toEqual([]);
  });
});

describe('cross-site write protection', () => {
  const post = (headers: Record<string, string>) =>
    c.app.inject({ method: 'POST', url: '/api/articles', payload: { title: 'X' }, headers: { cookie: c.editor, host: 'hub.test', ...headers } });
  it('rejects non-GET /api requests from another site (Sec-Fetch-Site or a foreign Origin)', async () => {
    expect((await post({ 'sec-fetch-site': 'cross-site' })).statusCode).toBe(403);
    expect((await post({ 'sec-fetch-site': 'same-site' })).statusCode).toBe(403);
    expect((await post({ origin: 'https://evil.example' })).statusCode).toBe(403);
    expect((await post({ origin: 'null' })).statusCode).toBe(403);
    expect((await post({ origin: 'https://evil.example' })).json()).toEqual({ error: 'cross_site' });
  });
  it('allows same-origin browsers and header-less clients; GET is never blocked', async () => {
    expect((await post({ 'sec-fetch-site': 'same-origin' })).statusCode).toBe(201);
    expect((await post({ 'sec-fetch-site': 'none' })).statusCode).toBe(201);
    expect((await post({ origin: 'http://hub.test' })).statusCode).toBe(201);
    expect((await post({})).statusCode).toBe(201);
    const get = await c.app.inject({ url: '/api/articles', headers: { cookie: c.editor, 'sec-fetch-site': 'cross-site' } });
    expect(get.statusCode).toBe(200);
  });
});

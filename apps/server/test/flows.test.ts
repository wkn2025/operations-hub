import { describe, it, expect, beforeEach } from 'vitest';
import { EDI_EXAMPLE, validateFlow } from '@ops/shared';
import { setup, setSetting, doc, type Ctx } from './helpers';
import { SEED_FLOWS } from '../src/seed/content/flows';

let c: Ctx;
beforeEach(async () => { c = await setup(); });

const article = async (title = 'Corrective procedure', publish = true) => {
  const a = (await c.req(c.editor, 'POST', '/api/articles', { title, content: doc('Do the thing') })).body;
  if (publish) await c.req(c.editor, 'POST', `/api/articles/${a.id}/publish`);
  return a;
};
const ediWith = (articleId: string) => ({ ...EDI_EXAMPLE, nodes: EDI_EXAMPLE.nodes.map((n) => (n.kind === 'article' ? { ...n, articleId } : n)) });
const mk = async (body: any, who = c.editor) => (await c.req(who, 'POST', '/api/flows', body)).body;
const pub = (id: string, who = c.editor) => c.req(who, 'POST', `/api/flows/${id}/publish`);
const mkPublished = async (title = 'EDI claim failed to import') => {
  const a = await article();
  const f = await mk({ ...ediWith(a.id), title, articleId: a.id });
  expect((await pub(f.id)).status).toBe(200);
  return { f, a };
};

describe('flows API', () => {
  it('editor creates a draft with a slug, owner and audit row; validation is returned', async () => {
    const a = await article();
    const r = await c.req(c.editor, 'POST', '/api/flows', ediWith(a.id));
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ slug: 'edi-claim-failed-to-import', status: 'draft', revision: 1, startId: 'gop' });
    expect(r.body.validation.ok).toBe(true);
    expect(r.body.nodes).toHaveLength(6);
    const rows = c.app.sqlite.prepare("select action from audit_log where entity = 'flow'").all();
    expect(rows).toEqual([{ action: 'flow.create' }]);
  });

  it('viewers see published flows only (list, id, slug); drafts and archived are 404', async () => {
    const { f } = await mkPublished('Visible flow');
    const draft = await mk({ title: 'Secret draft', nodes: [], startId: '' });
    const list = (await c.req(c.viewer, 'GET', '/api/flows')).body.flows;
    expect(list.map((x: any) => x.title)).toEqual(['Visible flow']);
    expect(list[0].startText).toBe('Is there a GOP for this case?');
    expect((await c.req(c.viewer, 'GET', `/api/flows/${f.slug}`)).status).toBe(200);
    expect((await c.req(c.viewer, 'GET', `/api/flows/${draft.id}`)).status).toBe(404);
    expect((await c.req(c.viewer, 'GET', `/api/flows/${draft.slug}`)).status).toBe(404);
    const all = (await c.req(c.editor, 'GET', '/api/flows')).body.flows;
    expect(all.map((x: any) => x.title).sort()).toEqual(['Secret draft', 'Visible flow']);
    await c.req(c.admin, 'POST', `/api/flows/${f.id}/archive`);
    expect((await c.req(c.viewer, 'GET', `/api/flows/${f.id}`)).status).toBe(404);
    expect((await c.req(undefined, 'GET', '/api/flows')).status).toBe(401);
  });

  it('viewers cannot use any write route', async () => {
    const { f } = await mkPublished();
    const writes: [string, string, unknown?][] = [
      ['POST', '/api/flows', { title: 'x' }],
      ['PATCH', `/api/flows/${f.id}`, { baseRevision: f.revision, title: 'hacked' }],
      ['POST', `/api/flows/${f.id}/publish`], ['POST', `/api/flows/${f.id}/submit`],
      ['POST', `/api/flows/${f.id}/archive`], ['POST', `/api/flows/${f.id}/restore`],
    ];
    for (const [m, u, b] of writes) expect((await c.req(c.viewer, m, u, b)).status, `${m} ${u}`).toBe(403);
    for (const [m, u, b] of writes) expect((await c.req(undefined, m, u, b)).status, `anon ${m} ${u}`).toBe(401);
    expect((await c.req(c.admin, 'GET', `/api/flows/${f.id}`)).body.title).toBe('EDI claim failed to import');
  });

  it('draft saves may be incomplete, but integrity errors are rejected on every write', async () => {
    const f = await mk({ title: 'WIP' });
    expect(f.status).toBe('draft');
    const wip = [{ id: 'a', kind: 'question', text: 'Start?', options: [{ label: 'Yes', to: 'r' }] }, { id: 'r', kind: 'result', text: 'Done' }];
    const ok = await c.req(c.editor, 'PATCH', `/api/flows/${f.id}`, { baseRevision: 1, nodes: wip, startId: 'a' });
    expect(ok.status).toBe(200);
    expect(ok.body.validation.ok).toBe(false); // one answer only: flagged, not blocked
    const dangling = [{ id: 'a', kind: 'question', text: 'Q?', options: [{ label: 'x', to: 'nope' }, { label: 'y', to: 'r' }] }, { id: 'r', kind: 'result', text: 'Done' }];
    const bad = await c.req(c.editor, 'PATCH', `/api/flows/${f.id}`, { baseRevision: 2, nodes: dangling, startId: 'a' });
    expect(bad.status).toBe(422);
    expect(bad.body.errors.join()).toMatch(/nope/);
    const loop = [{ id: 'a', kind: 'question', text: 'A?', options: [{ label: 'x', to: 'b' }, { label: 'y', to: 'b' }] }, { id: 'b', kind: 'question', text: 'B?', options: [{ label: 'x', to: 'a' }, { label: 'y', to: 'a' }] }];
    expect((await c.req(c.editor, 'PATCH', `/api/flows/${f.id}`, { baseRevision: 2, nodes: loop, startId: 'a' })).status).toBe(422);
    expect((await c.req(c.editor, 'PATCH', `/api/flows/${f.id}`, { baseRevision: 2, nodes: [{ id: 'a', kind: 'bogus', text: 'x' }] })).status).toBe(400);
    expect((await c.req(c.editor, 'POST', '/api/flows', { title: 'dup', nodes: [{ id: 'a', kind: 'result', text: 'x' }, { id: 'a', kind: 'result', text: 'y' }], startId: 'a' })).status).toBe(422);
  });

  it('publish needs a valid flow and existing articles; 409 on stale baseRevision', async () => {
    const f = await mk({ title: 'Half', nodes: [{ id: 'a', kind: 'question', text: 'Q?' }], startId: 'a' });
    const r = await pub(f.id);
    expect(r.status).toBe(422);
    expect(r.body.errors.length).toBeGreaterThan(0);
    const ghost = await mk({ ...EDI_EXAMPLE, title: 'Ghost article', nodes: EDI_EXAMPLE.nodes.map((n) => (n.kind === 'article' ? { ...n, articleId: 'missing' } : n)) });
    expect((await c.req(c.editor, 'GET', `/api/flows/${ghost.id}`)).body.validation.errors.join()).toMatch(/article/i);
    expect((await pub(ghost.id)).status).toBe(422);
    const a = await article();
    const good = await mk(ediWith(a.id));
    expect((await c.req(c.editor, 'PATCH', `/api/flows/${good.id}`, { baseRevision: 1, title: 'one' })).status).toBe(200);
    const stale = await c.req(c.editor2, 'PATCH', `/api/flows/${good.id}`, { baseRevision: 1, title: 'two' });
    expect(stale.status).toBe(409);
    expect(stale.body.current.revision).toBe(2);
  });

  it('a published flow can only be edited into a valid state', async () => {
    const { f } = await mkPublished();
    const broken = f.nodes.map((n: any) => (n.id === 'gop' ? { ...n, options: [n.options[0]] } : n));
    const r = await c.req(c.editor, 'PATCH', `/api/flows/${f.id}`, { baseRevision: f.revision + 1, nodes: broken });
    expect(r.status).toBe(422);
    expect((await c.req(c.viewer, 'GET', `/api/flows/${f.id}`)).body.nodes.find((n: any) => n.id === 'gop').options).toHaveLength(2);
  });

  it('requireApproval: editors cannot publish or change a published flow; admin can', async () => {
    const a = await article();
    const f = await mk(ediWith(a.id));
    await setSetting(c.app, 'requireApproval', true);
    expect((await pub(f.id)).status).toBe(403);
    expect((await c.req(c.editor, 'POST', `/api/flows/${f.id}/submit`)).body.status).toBe('in_review');
    expect((await pub(f.id, c.admin)).status).toBe(200);
    const cur = (await c.req(c.admin, 'GET', `/api/flows/${f.id}`)).body;
    expect((await c.req(c.editor, 'PATCH', `/api/flows/${f.id}`, { baseRevision: cur.revision, title: 'x' })).status).toBe(403);
    expect((await c.req(c.editor, 'POST', `/api/flows/${f.id}/archive`)).status).toBe(403);
    expect(cur.permissions).toMatchObject({ write: true });
    expect((await c.req(c.editor, 'GET', `/api/flows/${f.id}`)).body.permissions).toMatchObject({ write: false, publish: false });
    expect((await c.req(c.admin, 'POST', `/api/flows/${f.id}/archive`)).body.status).toBe('archived');
    expect((await c.req(c.admin, 'POST', `/api/flows/${f.id}/restore`)).body.status).toBe('draft');
  });

  it('article node availability: unavailable for viewers when the article is not readable', async () => {
    const { f, a } = await mkPublished();
    expect((await c.req(c.viewer, 'GET', `/api/flows/${f.id}`)).body.articles[a.id]).toMatchObject({ status: 'published', title: 'Corrective procedure', slug: expect.any(String) });
    await c.req(c.admin, 'POST', `/api/articles/${a.id}/archive`);
    const v = await c.req(c.viewer, 'GET', `/api/flows/${f.id}`);
    expect(v.status).toBe(200);
    expect(v.body.articles[a.id]).toEqual({ status: 'unavailable' });
  });

  it('GET /api/articles/:id includes the published flow linked to it, else null', async () => {
    const { f, a } = await mkPublished();
    expect((await c.req(c.viewer, 'GET', `/api/articles/${a.id}`)).body.flow).toEqual({ id: f.id, slug: f.slug, title: f.title });
    const other = await article('Other');
    expect((await c.req(c.viewer, 'GET', `/api/articles/${other.id}`)).body.flow).toBeNull();
    await c.req(c.admin, 'POST', `/api/flows/${f.id}/archive`);
    expect((await c.req(c.viewer, 'GET', `/api/articles/${a.id}`)).body.flow).toBeNull();
  });

  it('articleId must exist; unknown ids are rejected', async () => {
    expect((await c.req(c.editor, 'POST', '/api/flows', { title: 'x', articleId: 'nope' })).status).toBe(400);
  });
});

describe('flow search', () => {
  const flowHits = async (who: string, q: string) =>
    ((await c.req(who, 'GET', `/api/search?q=${encodeURIComponent(q)}`)).body.groups.find((g: any) => g.kind === 'flow')?.hits ?? []) as any[];

  it('indexes title and node text; viewers get published only; follows edits', async () => {
    const { f } = await mkPublished('Rejected claim flow');
    const draft = await mk({ title: 'Quarantine draft zebra', nodes: [{ id: 'a', kind: 'result', text: 'zebra' }], startId: 'a' });
    expect((await flowHits(c.viewer, 'rejected'))[0]).toMatchObject({ id: f.slug, title: 'Rejected claim flow' });
    expect((await flowHits(c.viewer, 'leading zeros'))[0].id).toBe(f.slug); // option label text
    expect((await flowHits(c.viewer, 'zebra'))).toHaveLength(0);
    expect((await flowHits(c.editor, 'zebra')).map((h) => h.id)).toEqual([draft.slug]);
    await c.req(c.admin, 'POST', `/api/flows/${f.id}/archive`);
    expect(await flowHits(c.viewer, 'rejected')).toHaveLength(0);
    expect(await flowHits(c.editor, 'rejected')).toHaveLength(1); // editors may read archived flows, so search shows them too (one rule: can(flow:read))
  });
});

describe('seed flows', () => {
  it('ship 3 demo flows with >= 8 nodes that pass validateFlow', () => {
    expect(SEED_FLOWS.map((f) => f.title)).toEqual(['EDI claim failed to import (DEMO)', 'Invoice cannot be registered (DEMO)', 'Payment returned by bank (DEMO)']);
    for (const f of SEED_FLOWS) {
      expect(f.nodes.length, f.title).toBeGreaterThanOrEqual(8);
      const v = validateFlow({ title: f.title, startId: f.startId, nodes: f.nodes.map((n) => (n.kind === 'article' ? { ...n, articleId: 'x' } : n)) });
      expect(v.errors, f.title).toEqual([]);
      expect(v.warnings, f.title).toEqual([]);
    }
  });
});

describe('seedBase flows', () => {
  it('creates 3 published, valid flows linked to seeded articles; idempotent; the troubleshooting article exposes its flow', async () => {
    const { mkdtempSync } = await import('node:fs'), { tmpdir } = await import('node:os'), { join } = await import('node:path');
    const { seedBase } = await import('../src/seed/base');
    const s = await setup(mkdtempSync(join(tmpdir(), 'ops-flow-')));
    await seedBase(s.app);
    const first = (await s.req(s.viewer, 'GET', '/api/flows')).body.flows;
    expect(first.map((f: any) => f.title).sort()).toEqual(['EDI claim failed to import (DEMO)', 'Invoice cannot be registered (DEMO)', 'Payment returned by bank (DEMO)']);
    for (const f of first) {
      const full = (await s.req(s.admin, 'GET', `/api/flows/${f.id}`)).body;
      expect(full.validation, f.title).toMatchObject({ ok: true, errors: [], warnings: [] });
      for (const n of full.nodes.filter((x: any) => x.kind === 'article')) expect(full.articles[n.articleId].status, n.id).toBe('published');
    }
    await seedBase(s.app);
    expect(((await s.req(s.viewer, 'GET', '/api/flows')).body.flows as any[]).map((f) => f.id).sort()).toEqual(first.map((f: any) => f.id).sort());
    const rev = s.app.sqlite.prepare('select revision from flows order by slug').all();
    await seedBase(s.app);
    expect(s.app.sqlite.prepare('select revision from flows order by slug').all()).toEqual(rev);
    const art = (await s.req(s.viewer, 'GET', '/api/articles/edi-claim-failed-to-import')).body;
    expect(art.flow).toMatchObject({ slug: 'edi-claim-failed-to-import-demo' });
  });
});

describe('review fixes', () => {
  it('submit runs the same completeness validation as publish', async () => {
    const f = await mk({ title: 'Half', nodes: [{ id: 'a', kind: 'question', text: 'Q?' }], startId: 'a' });
    const r = await c.req(c.editor, 'POST', `/api/flows/${f.id}/submit`);
    expect(r.status).toBe(422);
    expect((await c.req(c.editor, 'GET', `/api/flows/${f.id}`)).body.status).toBe('draft');
  });

  it('list, get and search agree for viewer, editor and admin across every status', async () => {
    const a = await article();
    const ids: Record<string, string> = {};
    for (const st of ['draft', 'in_review', 'published', 'archived']) {
      const f = await mk({ ...ediWith(a.id), title: `Visibility probe ${st.replace('_', 'x')}` });
      ids[st] = f.id;
      if (st !== 'draft') c.app.sqlite.prepare('update flows set status = ? where id = ?').run(st, f.id);
    }
    for (const [who, name] of [[c.viewer, 'viewer'], [c.editor, 'editor'], [c.admin, 'admin']] as const) {
      const listed = new Set((await c.req(who, 'GET', '/api/flows')).body.flows.map((x: any) => x.id));
      const found = new Set(((await c.req(who, 'GET', '/api/search?q=visibility+probe')).body.groups.find((g: any) => g.kind === 'flow')?.hits ?? []).map((h: any) => h.id));
      for (const [st, id] of Object.entries(ids)) {
        const slug = c.app.sqlite.prepare('select slug from flows where id = ?').get(id) as { slug: string };
        const got = (await c.req(who, 'GET', `/api/flows/${id}`)).status === 200;
        expect(listed.has(id), `${name} list ${st}`).toBe(got);
        expect(found.has(slug.slug), `${name} search ${st}`).toBe(got);
      }
    }
  });

  it('article map has no prototype keys', async () => {
    const { f } = await mkPublished();
    const body = (await c.req(c.viewer, 'GET', `/api/flows/${f.id}`)).body;
    const nodes = body.nodes.map((n: any) => (n.kind === 'article' ? { ...n, articleId: '__proto__' } : n));
    const g = await mk({ title: 'Proto', nodes, startId: 'gop' });
    const v = (await c.req(c.editor, 'GET', `/api/flows/${g.id}`)).body;
    expect(Object.prototype.hasOwnProperty.call(v.articles, '__proto__')).toBe(true);
    expect(({} as any).status).toBeUndefined();
  });

  it('autosaves coalesce into one flow.update audit row; explicit saves add rows', async () => {
    const a = await article();
    const g = await mk({ ...ediWith(a.id), title: 'Audit me too' });
    let rev = g.revision;
    for (let i = 0; i < 4; i++) rev = (await c.req(c.editor, 'PATCH', `/api/flows/${g.id}`, { baseRevision: rev, title: `Audit v${i}`, autosave: true })).body.revision;
    const count = () => (c.app.sqlite.prepare("select count(*) n from audit_log where action = 'flow.update' and entity_id = ?").get(g.id) as any).n;
    expect(count()).toBe(1);
    await c.req(c.editor, 'PATCH', `/api/flows/${g.id}`, { baseRevision: rev, title: 'Checkpoint' });
    expect(count()).toBe(2);
  });

  it('demo flow titles are labelled DEMO and the first step says so', () => {
    for (const f of SEED_FLOWS) {
      expect(f.title, f.title).toMatch(/\(DEMO\)$/);
      expect(f.nodes.find((n) => n.id === f.startId)!.detail, f.title).toMatch(/DEMO/);
    }
  });
});

describe('seed rename', () => {
  it('a database seeded before the DEMO label is renamed, not duplicated', async () => {
    const { mkdtempSync } = await import('node:fs'), { tmpdir } = await import('node:os'), { join } = await import('node:path');
    const { seedBase } = await import('../src/seed/base');
    const s = await setup(mkdtempSync(join(tmpdir(), 'ops-flow-')));
    await seedBase(s.app);
    s.app.sqlite.prepare("update flows set title = replace(title, ' (DEMO)', ''), slug = replace(slug, '-demo', '')").run();
    await seedBase(s.app);
    expect(s.app.sqlite.prepare('select title from flows order by title').all().map((r: any) => r.title)).toEqual(['EDI claim failed to import (DEMO)', 'Invoice cannot be registered (DEMO)', 'Payment returned by bank (DEMO)']);
  });
});

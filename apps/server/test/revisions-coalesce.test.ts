import { beforeEach, describe, expect, it } from 'vitest';
import { templateFieldsSchema } from '@ops/shared';
import { SEED_ARTICLES } from '../src/seed/content/articles';
import { doc, setup, type Ctx } from './helpers';

let c: Ctx;
beforeEach(async () => { c = await setup(); });

const create = async (cookie = c.editor) => (await c.req(cookie, 'POST', '/api/articles', { title: 'Coalesce me', content: doc('v0') })).body;
const revs = async (id: string) => (await c.req(c.editor, 'GET', `/api/articles/${id}/revisions`)).body.revisions as { rev: number; note: string | null }[];
const save = async (id: string, base: number, text: string, autosave: boolean, cookie = c.editor) =>
  c.req(cookie, 'PATCH', `/api/articles/${id}`, { baseRevision: base, content: doc(text), autosave });
/** Clock injection: age the latest revision row instead of mocking Date inside Fastify. */
const age = (id: string, minutes: number) =>
  c.app.sqlite.prepare('update revisions set created_at = ? where article_id = ? and rev = (select max(rev) from revisions where article_id = ?)')
    .run(new Date(Date.now() - minutes * 60_000).toISOString(), id, id);

describe('autosave coalescing', () => {
  it('20 rapid autosaves by one author produce one revision after the created one; baseRevision stays the concurrency counter', async () => {
    const a = await create();
    let base = a.revision;
    for (let i = 1; i <= 20; i++) {
      const r = await save(a.id, base, `v${i}`, true);
      expect(r.status).toBe(200);
      expect(r.body.revision).toBe(base + 1);
      base = r.body.revision;
    }
    const list = await revs(a.id);
    expect(list.map((r) => r.rev)).toEqual([2, 1]); // the open row keeps its number; articles.revision (21) runs ahead
    const latest = (await c.req(c.editor, 'GET', `/api/articles/${a.id}/revisions/2`)).body;
    expect(JSON.stringify(latest.content)).toContain('v20');
    // stale base still 409s
    expect((await save(a.id, 20, 'stale', true)).status).toBe(409);
  });

  it('an explicit save cuts a checkpoint; the next autosave starts a new revision', async () => {
    const a = await create();
    const r1 = await save(a.id, a.revision, 'auto1', true);
    const r2 = await save(a.id, r1.body.revision, 'auto2', true);
    const r3 = await save(a.id, r2.body.revision, 'explicit', false);
    const r4 = await save(a.id, r3.body.revision, 'auto3', true);
    await save(a.id, r4.body.revision, 'auto4', true);
    expect((await revs(a.id)).map((r) => r.rev)).toEqual([5, 4, 2, 1]);
  });

  it('a different author always starts a new revision', async () => {
    const a = await create();
    const r1 = await save(a.id, a.revision, 'mine', true);
    await save(a.id, r1.body.revision, 'theirs', true, c.editor2);
    expect((await revs(a.id)).length).toBe(3);
  });

  it('after 10 minutes a new revision is cut', async () => {
    const a = await create();
    const r1 = await save(a.id, a.revision, 'early', true);
    age(a.id, 11);
    await save(a.id, r1.body.revision, 'late', true);
    expect((await revs(a.id)).length).toBe(3);
  });

  it('status transitions seal the latest revision', async () => {
    const a = await create();
    const r1 = await save(a.id, a.revision, 'before submit', true);
    await c.req(c.editor, 'POST', `/api/articles/${a.id}/submit`);
    await save(a.id, r1.body.revision, 'in review edit', true);
    const list = await revs(a.id);
    expect(list.length).toBe(3);
    expect(list[1]!.note).toMatch(/submitted/i);
  });

  it('published articles get a revision per save', async () => {
    const a = await create();
    await c.req(c.editor, 'POST', `/api/articles/${a.id}/publish`);
    let base = a.revision;
    for (const t of ['p1', 'p2', 'p3']) base = (await save(a.id, base, t, true)).body.revision;
    expect((await revs(a.id)).length).toBe(4);
  });

  it('a coalesced revision can be restored', async () => {
    const a = await create();
    const r1 = await save(a.id, a.revision, 'draft text A', true);
    const r2 = await save(a.id, r1.body.revision, 'draft text B', true); // coalesced into rev 2
    const r3 = await save(a.id, r2.body.revision, 'explicit C', false);
    const res = await c.req(c.editor, 'POST', `/api/articles/${a.id}/revisions/2/restore`);
    expect(res.status).toBe(200);
    expect(res.body.revision).toBe(r3.body.revision + 1);
    expect(JSON.stringify(res.body.content)).toContain('draft text B');
  });
});

describe('revision numbers are stable', () => {
  it('an open revision keeps its number while later autosaves overwrite it', async () => {
    const a = await create();
    const r1 = await save(a.id, a.revision, 'first', true); // opens rev 2
    expect((await revs(a.id))[0]!.rev).toBe(2);
    let base = r1.body.revision;
    for (let i = 0; i < 5; i++) base = (await save(a.id, base, `newest ${i}`, true)).body.revision;
    expect(base).toBe(7); // concurrency counter keeps going
    const g = await c.req(c.editor, 'GET', `/api/articles/${a.id}/revisions/2`);
    expect(g.status).toBe(200);
    expect(JSON.stringify(g.body.content)).toContain('newest 4');
    const list = await revs(a.id) as unknown as { rev: number; coalescable: boolean }[];
    expect(list[0]).toMatchObject({ rev: 2, coalescable: true }); // shown as "Autosaved draft"
  });

  it('restoring an open revision after more autosaves works and numbers the restore after the counter', async () => {
    const a = await create();
    let base = (await save(a.id, a.revision, 'keep me', true)).body.revision; // rev 2 open
    base = (await save(a.id, base, 'keep me too', false)).body.revision; // rev 3 checkpoint
    for (let i = 0; i < 3; i++) base = (await save(a.id, base, `later ${i}`, true)).body.revision; // rev 4 open, counter 6
    const res = await c.req(c.editor, 'POST', `/api/articles/${a.id}/revisions/2/restore`);
    expect(res.status).toBe(200);
    expect(res.body.revision).toBe(base + 1);
    expect(JSON.stringify(res.body.content)).toContain('keep me');
    expect((await revs(a.id)).map((r) => r.rev)).toEqual([base + 1, 4, 3, 2, 1]);
    // after a restore the next autosave starts a fresh row (restore rows are sealed)
    await save(a.id, res.body.revision, 'after restore', true);
    expect((await revs(a.id))[0]!.rev).toBe(base + 2);
  });

  it('transitions seal the latest row even when the counter is ahead of it', async () => {
    const a = await create();
    let base = (await save(a.id, a.revision, 'x', true)).body.revision;
    base = (await save(a.id, base, 'y', true)).body.revision; // counter 3, open row 2
    await c.req(c.editor, 'POST', `/api/articles/${a.id}/submit`);
    const sealed = (await revs(a.id))[0] as unknown as { rev: number; coalescable: boolean; note: string };
    expect(sealed).toMatchObject({ rev: 2, coalescable: false, note: 'submitted for review' });
    await save(a.id, base, 'z', true);
    expect((await revs(a.id)).map((r) => r.rev)).toEqual([4, 2, 1]);
  });

  it('(article_id, rev) stays unique', async () => {
    const a = await create();
    let base = a.revision;
    for (const [t, auto] of [['a', true], ['b', true], ['c', false], ['d', true], ['e', true]] as const) base = (await save(a.id, base, t, auto)).body.revision;
    await c.req(c.editor, 'POST', `/api/articles/${a.id}/revisions/2/restore`);
    const dup = c.app.sqlite.prepare('select rev, count(*) n from revisions where article_id = ? group by rev having n > 1').all(a.id);
    expect(dup).toEqual([]);
  });
});

describe('owner reassignment', () => {
  it('only admins or the current owner may change the owner; the change is audited', async () => {
    const a = await create(); // owner = editor
    const ownerOf = (email: string) => (c.app.sqlite.prepare('select id from users where email = ?').get(email) as { id: string }).id;
    const ed2 = ownerOf('ed2@x.test'), ed = ownerOf('ed@x.test');
    // editor2 is not the owner
    expect((await c.req(c.editor2, 'PATCH', `/api/articles/${a.id}`, { baseRevision: a.revision, ownerId: ed2 })).status).toBe(403);
    // owner hands it over
    const r = await c.req(c.editor, 'PATCH', `/api/articles/${a.id}`, { baseRevision: a.revision, ownerId: ed2 });
    expect(r.status).toBe(200);
    // previous owner can no longer change it; admin can
    expect((await c.req(c.editor, 'PATCH', `/api/articles/${a.id}`, { baseRevision: r.body.revision, ownerId: ed })).status).toBe(403);
    const ad = await c.req(c.admin, 'PATCH', `/api/articles/${a.id}`, { baseRevision: r.body.revision, ownerId: ed });
    expect(ad.status).toBe(200);
    const audits = c.app.sqlite.prepare("select json_extract(detail, '$.summary') as summary from audit_log where action = 'article.owner_change' and entity_id = ? order by rowid").all(a.id) as { summary: string }[];
    expect(audits).toHaveLength(2);
    expect(audits[0]!.summary).toMatch(/from .* to /i);
    // sending the unchanged owner is not a change
    expect((await c.req(c.editor2, 'PATCH', `/api/articles/${a.id}`, { baseRevision: ad.body.revision, ownerId: ed, title: 'x' })).status).toBe(200);
  });
});

describe('template fields validation', () => {
  it('every seed article\'s fields pass the shared schema', () => {
    for (const s of SEED_ARTICLES) expect(templateFieldsSchema.safeParse(s.fields ?? {}).success, s.title).toBe(true);
  });

  it('rejects wrong shapes and strips unknown keys', async () => {
    const bad = [{ keyLimits: 'lots' }, { systems: 'Globo' }, { validFrom: '31/12/2026' }, { summary: 'x'.repeat(2001) }, { validFrom: '2026-05-01', validTo: '2026-01-01' }, { keyLimits: [{ label: '', value: '1' }] }];
    for (const fields of bad) expect((await c.req(c.editor, 'POST', '/api/articles', { title: 'F', fields })).status, JSON.stringify(fields)).toBe(400);
    const ok = await c.req(c.editor, 'POST', '/api/articles', { title: 'F', fields: { client: 'Acme', evil: '<script>', keyLimits: [{ label: 'Cap', value: '5' }] } });
    expect(ok.status).toBe(201);
    expect(ok.body.fields).toEqual({ client: 'Acme', keyLimits: [{ label: 'Cap', value: '5' }] });
    const p = await c.req(c.editor, 'PATCH', `/api/articles/${ok.body.id}`, { baseRevision: ok.body.revision, fields: { aliases: 'nope' } });
    expect(p.status).toBe(400);
  });
});

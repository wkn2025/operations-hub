import { beforeEach, describe, expect, it } from 'vitest';
import { doc, setSetting, setup, type Ctx } from './helpers';

// Server support for the Task 6 editor: explicit related articles, per-article permissions, tags + owner lists, owner change.
let c: Ctx;
beforeEach(async () => { c = await setup(); });

const create = async (title: string, extra: Record<string, unknown> = {}) =>
  (await c.req(c.editor, 'POST', '/api/articles', { title, content: doc('x'), ...extra })).body;

describe('related articles', () => {
  it('stores explicit related links on create and patch, and returns them readable-only', async () => {
    const a = await create('A'), b = await create('B'), d = await create('D');
    await c.req(c.editor, 'POST', `/api/articles/${b.id}/publish`);
    const made = await create('With related', { related: [a.id, b.id, 'nope'] });
    expect(made.related.map((r: any) => r.id).sort()).toEqual([a.id, b.id].sort());

    const p = await c.req(c.editor, 'PATCH', `/api/articles/${made.id}`, { baseRevision: made.revision, related: [d.id, made.id] });
    expect(p.status).toBe(200);
    expect(p.body.related).toEqual([{ id: d.id, title: 'D', slug: d.slug, status: 'draft', type: 'standard' }]); // self link dropped

    await c.req(c.editor, 'PATCH', `/api/articles/${made.id}`, { baseRevision: p.body.revision, related: [a.id, b.id] });
    await c.req(c.editor, 'POST', `/api/articles/${made.id}/publish`);
    const v = await c.req(c.viewer, 'GET', `/api/articles/${made.id}`);
    expect(v.body.related.map((r: any) => r.id)).toEqual([b.id]); // draft A hidden from viewers
  });

  it('omitting related on patch keeps the existing list', async () => {
    const a = await create('A');
    const m = await create('M', { related: [a.id] });
    const p = await c.req(c.editor, 'PATCH', `/api/articles/${m.id}`, { baseRevision: m.revision, title: 'M2' });
    expect(p.body.related.map((r: any) => r.id)).toEqual([a.id]);
  });
});

describe('permissions in article view', () => {
  it('reflects can() and requireApproval for the caller', async () => {
    const a = await create('P');
    expect(a.permissions).toEqual({ write: true, publish: true, submit: true, archive: true });
    setSetting(c.app, 'requireApproval', true);
    const e = await c.req(c.editor, 'GET', `/api/articles/${a.id}`);
    expect(e.body.permissions).toMatchObject({ write: true, publish: false, submit: true });
    const ad = await c.req(c.admin, 'GET', `/api/articles/${a.id}`);
    expect(ad.body.permissions.publish).toBe(true);
    await c.req(c.admin, 'POST', `/api/articles/${a.id}/publish`);
    const v = await c.req(c.viewer, 'GET', `/api/articles/${a.id}`);
    expect(v.body.permissions).toEqual({ write: false, publish: false, submit: false, archive: false });
  });
});

describe('tags and owners lists', () => {
  it('GET /api/tags lists used tag names for editors only', async () => {
    await create('T', { tags: ['EDI', 'gop'] });
    const r = await c.req(c.editor, 'GET', '/api/tags');
    expect(r.status).toBe(200);
    expect(r.body.tags).toEqual(['edi', 'gop']);
    expect((await c.req(c.viewer, 'GET', '/api/tags')).status).toBe(403);
  });

  it('GET /api/owners lists active editors and admins for editors only', async () => {
    const r = await c.req(c.editor, 'GET', '/api/owners');
    expect(r.status).toBe(200);
    const emails = r.body.owners.map((o: any) => o.email).sort();
    expect(emails).toEqual(['boss@x.test', 'ed2@x.test', 'ed@x.test']);
    expect((await c.req(c.viewer, 'GET', '/api/owners')).status).toBe(403);
  });

  it('PATCH ownerId accepts editors/admins and rejects viewers or unknown users', async () => {
    const a = await create('O');
    const owners = (await c.req(c.editor, 'GET', '/api/owners')).body.owners;
    const ed2 = owners.find((o: any) => o.email === 'ed2@x.test');
    const ok = await c.req(c.editor, 'PATCH', `/api/articles/${a.id}`, { baseRevision: a.revision, ownerId: ed2.id });
    expect(ok.status).toBe(200);
    expect(ok.body.owner.id).toBe(ed2.id);
    const viewerId = (c.app.sqlite.prepare("select id from users where email='v@x.test'").get() as { id: string }).id;
    for (const bad of [viewerId, 'missing']) {
      const r = await c.req(c.admin, 'PATCH', `/api/articles/${a.id}`, { baseRevision: ok.body.revision, ownerId: bad }); // admin: only validity is under test
      expect(r.status).toBe(400);
    }
  });
});

import { describe, it, expect, beforeEach } from 'vitest';
import { setup, type Ctx } from './helpers';

let c: Ctx;
beforeEach(async () => { c = await setup(); });
const mk = async (name: string, parentId?: string) => (await c.req(c.admin, 'POST', '/api/categories', { name, parentId })).body.id as string;

describe('categories', () => {
  it('admin creates, lists; slugs unique', async () => {
    const a = await mk('EDI & Automation');
    const b = await mk('EDI & Automation');
    const list = (await c.req(c.viewer, 'GET', '/api/categories')).body.categories;
    expect(list.map((x: any) => x.id).sort()).toEqual([a, b].sort());
    expect(new Set(list.map((x: any) => x.slug)).size).toBe(2);
  });
  it('anonymous cannot list', async () => {
    expect((await c.req(undefined, 'GET', '/api/categories')).status).toBe(401);
  });
  it('archived category hidden from viewers, visible to admin; its articles hidden from viewers', async () => {
    const cat = await mk('Old');
    const art = (await c.req(c.editor, 'POST', '/api/articles', { title: 'In old', categoryId: cat })).body.id;
    await c.req(c.admin, 'POST', `/api/articles/${art}/publish`);
    expect((await c.req(c.viewer, 'GET', `/api/articles/${art}`)).status).toBe(200);
    expect((await c.req(c.admin, 'PATCH', `/api/categories/${cat}`, { archived: true })).status).toBe(200);
    expect((await c.req(c.viewer, 'GET', '/api/categories')).body.categories).toHaveLength(0);
    expect((await c.req(c.admin, 'GET', '/api/categories')).body.categories).toHaveLength(1);
    expect((await c.req(c.viewer, 'GET', `/api/articles/${art}`)).status).toBe(404);
    expect((await c.req(c.viewer, 'GET', '/api/search?q=old')).body.groups).toEqual([]);
  });
  it('archiving a category with active children is rejected (409); no delete route', async () => {
    const p = await mk('P'); const ch = await mk('Child', p);
    expect((await c.req(c.admin, 'PATCH', `/api/categories/${p}`, { archived: true })).status).toBe(409);
    await c.req(c.admin, 'PATCH', `/api/categories/${ch}`, { archived: true });
    expect((await c.req(c.admin, 'PATCH', `/api/categories/${p}`, { archived: true })).status).toBe(200);
    expect((await c.req(c.admin, 'DELETE', `/api/categories/${p}`)).status).toBe(404);
  });
  it('cannot become its own descendant or parent itself', async () => {
    const a = await mk('A'); const b = await mk('B', a); const d = await mk('D', b);
    expect((await c.req(c.admin, 'PATCH', `/api/categories/${a}`, { parentId: d })).status).toBe(400);
    expect((await c.req(c.admin, 'PATCH', `/api/categories/${a}`, { parentId: a })).status).toBe(400);
    expect((await c.req(c.admin, 'PATCH', `/api/categories/${d}`, { parentId: a, sortOrder: 3, name: 'D2' })).status).toBe(200);
  });
  it('renaming a category reindexes its articles', async () => {
    const cat = await mk('Before');
    const art = (await c.req(c.editor, 'POST', '/api/articles', { title: 'Thing', categoryId: cat })).body.id;
    await c.req(c.editor, 'POST', `/api/articles/${art}/publish`);
    await c.req(c.admin, 'PATCH', `/api/categories/${cat}`, { name: 'Renamedcat' });
    const r = await c.req(c.viewer, 'GET', '/api/search?q=renamedcat');
    expect(r.body.groups.find((g: any) => g.kind === 'article').hits[0].id).toBe(art);
  });
  it('writes are audited', async () => {
    const a = await mk('A');
    await c.req(c.admin, 'PATCH', `/api/categories/${a}`, { name: 'A2' });
    const rows = c.app.sqlite.prepare("select action, entity, entity_id, detail from audit_log where entity='category'").all() as any[];
    expect(rows.map((r) => r.action)).toEqual(['category.create', 'category.update']);
    expect(rows[1].entity_id).toBe(a);
    expect(JSON.parse(rows[1].detail).summary).toBeTruthy();
  });
});

import { describe, it, expect, beforeEach } from 'vitest';
import { setup, setSetting, doc, type Ctx } from './helpers';

let c: Ctx;
beforeEach(async () => { c = await setup(); });
const login = async (email: string) => {
  const r = await c.app.inject({ method: 'POST', url: '/api/auth/dev/login', payload: { email } });
  return { status: r.statusCode, cookie: ([r.headers['set-cookie']].flat()[0] as string | undefined)?.split(';')[0] ?? '' };
};
const role = async (cookie: string) => (await c.req(cookie, 'GET', '/api/me')).body.user?.role;
const users = async () => (await c.req(c.admin, 'GET', '/api/admin/users')).body.users as any[];
const uid = async (email: string) => (await users()).find((u) => u.email === email).id as string;

describe('admin routes are admin-only', () => {
  const routes: [string, string, unknown?][] = [
    ['GET', '/api/admin/users'], ['PATCH', '/api/admin/users/x', { role: 'viewer' }],
    ['GET', '/api/admin/allowlist'], ['POST', '/api/admin/allowlist', { email: 'a@x.test' }], ['DELETE', '/api/admin/allowlist/a%40x.test'],
    ['GET', '/api/admin/settings'], ['PATCH', '/api/admin/settings', { requireApproval: true }],
    ['GET', '/api/admin/audit'],
  ];
  it('viewer and editor get 403, anonymous 401', async () => {
    for (const [m, u, p] of routes) {
      expect((await c.req(c.viewer, m, u, p)).status, `viewer ${m} ${u}`).toBe(403);
      expect((await c.req(c.editor, m, u, p)).status, `editor ${m} ${u}`).toBe(403);
      expect((await c.req(undefined, m, u, p)).status, `anon ${m} ${u}`).toBe(401);
    }
    expect((await c.req(c.viewer, 'GET', '/api/admin/review-due')).status).toBe(403);
    expect((await c.req(undefined, 'GET', '/api/admin/review-due')).status).toBe(401);
  });
});

describe('allowlist', () => {
  it('adding promotes next login (and existing session immediately); removing demotes immediately and on login', async () => {
    const v = await login('late@x.test');
    expect(await role(v.cookie)).toBe('viewer');
    expect((await c.req(c.admin, 'POST', '/api/admin/allowlist', { email: 'LATE@x.test' })).status).toBe(201);
    expect(await role(v.cookie)).toBe('editor');
    expect((await c.req(c.admin, 'POST', '/api/admin/allowlist', { email: 'late@x.test' })).status).toBe(409);
    expect((await c.req(c.admin, 'GET', '/api/admin/allowlist')).body.entries.map((e: any) => e.email)).toContain('late@x.test');
    expect((await c.req(c.admin, 'DELETE', '/api/admin/allowlist/late%40x.test')).status).toBe(200);
    expect(await role(v.cookie)).toBe('viewer'); // very next request
    expect(await role((await login('late@x.test')).cookie)).toBe('viewer');
    expect((await c.req(c.admin, 'DELETE', '/api/admin/allowlist/late%40x.test')).status).toBe(404);
    expect((await c.req(c.admin, 'POST', '/api/admin/allowlist', { email: 'nope' })).status).toBe(400);
  });
  it('removing an allowlisted editor demotes their existing cookie at once', async () => {
    expect(await role(c.editor)).toBe('editor');
    await c.req(c.admin, 'DELETE', '/api/admin/allowlist/ed%40x.test');
    expect(await role(c.editor)).toBe('viewer');
    expect((await c.req(c.editor, 'POST', '/api/articles', { title: 't', categoryId: null })).status).toBe(403);
  });
});

describe('user role / deactivation', () => {
  it('role change takes effect on the very next request with the old cookie, and login keeps admin-set role', async () => {
    const id = await uid('ed@x.test');
    expect((await c.req(c.admin, 'PATCH', `/api/admin/users/${id}`, { role: 'viewer' })).status).toBe(200);
    expect(await role(c.editor)).toBe('viewer');
    expect((await c.req(c.editor, 'GET', '/api/admin/users')).status).toBe(403);
    // explicit admin-set role wins over allowlist at next login
    expect(await role((await login('ed@x.test')).cookie)).toBe('viewer');
    // admin-set promotion wins even if not on allowlist
    const vid = await uid('v@x.test');
    await c.req(c.admin, 'PATCH', `/api/admin/users/${vid}`, { role: 'editor' });
    expect(await role(c.viewer)).toBe('editor');
    expect(await role((await login('v@x.test')).cookie)).toBe('editor');
  });
  it('deactivated user gets 401 everywhere, cannot log in; reactivation restores', async () => {
    const id = await uid('ed@x.test');
    expect((await c.req(c.admin, 'PATCH', `/api/admin/users/${id}`, { active: false })).status).toBe(200);
    expect((await c.req(c.editor, 'GET', '/api/me')).body.user).toBeNull();
    expect((await c.req(c.editor, 'GET', '/api/articles')).status).toBe(401);
    expect((await c.req(c.editor, 'GET', '/api/admin/review-due')).status).toBe(401);
    expect((await login('ed@x.test')).status).toBe(403);
    await c.req(c.admin, 'PATCH', `/api/admin/users/${id}`, { active: true });
    expect(await role(c.editor)).toBe('editor');
  });
  it('bootstrap admin cannot be demoted or deactivated (409); a normal second admin can be demoted', async () => {
    const adminId = await uid('boss@x.test');
    expect((await c.req(c.admin, 'PATCH', `/api/admin/users/${adminId}`, { role: 'editor' })).status).toBe(409);
    expect((await c.req(c.admin, 'PATCH', `/api/admin/users/${adminId}`, { active: false })).status).toBe(409);
    const e2 = await uid('ed2@x.test');
    expect((await c.req(c.admin, 'PATCH', `/api/admin/users/${e2}`, { role: 'admin' })).status).toBe(200);
    expect(await role(c.editor2)).toBe('admin');
    expect((await c.req(c.editor2, 'PATCH', `/api/admin/users/${e2}`, { role: 'viewer' })).status).toBe(200); // not last
    expect(await role(c.editor2)).toBe('viewer');
  });
  it('last-active-admin guard applies to non-bootstrap admins', async () => {
    const e2 = await uid('ed2@x.test'), adminId = await uid('boss@x.test');
    await c.req(c.admin, 'PATCH', `/api/admin/users/${e2}`, { role: 'admin' });
    c.app.sqlite.prepare('update users set active = 0 where id = ?').run(adminId); // boss gone (e.g. env changed)
    expect((await c.req(c.editor2, 'PATCH', `/api/admin/users/${e2}`, { role: 'editor' })).status).toBe(409);
    expect((await c.req(c.editor2, 'PATCH', `/api/admin/users/${e2}`, { active: false })).status).toBe(409);
    expect(await role(c.editor2)).toBe('admin');
  });
  it('validates body and unknown user', async () => {
    const id = await uid('ed@x.test');
    expect((await c.req(c.admin, 'PATCH', `/api/admin/users/${id}`, { role: 'god' })).status).toBe(400);
    expect((await c.req(c.admin, 'PATCH', `/api/admin/users/${id}`, {})).status).toBe(400);
    expect((await c.req(c.admin, 'PATCH', '/api/admin/users/nope', { role: 'viewer' })).status).toBe(404);
  });
});

describe('settings & approval', () => {
  it('defaults false, validates with Zod, stores JSON in the same format as setSetting', async () => {
    expect((await c.req(c.admin, 'GET', '/api/admin/settings')).body).toEqual({ requireApproval: false });
    expect((await c.req(c.admin, 'PATCH', '/api/admin/settings', { requireApproval: 'yes' })).status).toBe(400);
    expect((await c.req(c.admin, 'PATCH', '/api/admin/settings', { bogus: 1 })).status).toBe(400);
    expect((await c.req(c.admin, 'PATCH', '/api/admin/settings', {})).status).toBe(400);
    expect((await c.req(c.admin, 'PATCH', '/api/admin/settings', { requireApproval: true })).body).toEqual({ requireApproval: true });
    expect((c.app.sqlite.prepare("select value from settings where key='requireApproval'").get() as any).value).toBe('true');
    setSetting(c.app, 'requireApproval', false);
    expect((await c.req(c.admin, 'GET', '/api/admin/settings')).body.requireApproval).toBe(false);
  });
  it('with requireApproval on: editor publish 403, submit -> in_review, admin publish ok', async () => {
    await c.req(c.admin, 'PATCH', '/api/admin/settings', { requireApproval: true });
    const a = (await c.req(c.editor, 'POST', '/api/articles', { title: 'Approval', content: doc('x') })).body;
    expect((await c.req(c.editor, 'POST', `/api/articles/${a.id}/publish`)).status).toBe(403);
    expect((await c.req(c.editor, 'POST', `/api/articles/${a.id}/submit`)).body.status).toBe('in_review');
    expect((await c.req(c.admin, 'POST', `/api/articles/${a.id}/publish`)).body.status).toBe('published');
  });
  it('reject returns an in_review article to draft; editor cannot reject under requireApproval; only from in_review', async () => {
    await c.req(c.admin, 'PATCH', '/api/admin/settings', { requireApproval: true });
    const a = (await c.req(c.editor, 'POST', '/api/articles', { title: 'Rejectable', content: doc('x') })).body;
    expect((await c.req(c.admin, 'POST', `/api/articles/${a.id}/reject`)).status).toBe(409); // draft: nothing to reject
    await c.req(c.editor, 'POST', `/api/articles/${a.id}/submit`);
    expect((await c.req(c.editor, 'POST', `/api/articles/${a.id}/reject`)).status).toBe(403);
    expect((await c.req(c.viewer, 'POST', `/api/articles/${a.id}/reject`)).status).toBe(403);
    expect((await c.req(c.admin, 'POST', `/api/articles/${a.id}/reject`)).body.status).toBe('draft');
    const log = (await c.req(c.admin, 'GET', '/api/admin/audit')).body.entries as any[];
    expect(log.some((e) => e.action === 'article.reject' && e.entityId === a.id)).toBe(true);
  });
});

describe('review-due', () => {
  it('editor+ sees overdue/soon, not later/none/archived', async () => {
    const d = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
    const mk = async (title: string, reviewDate: string | null) =>
      (await c.req(c.editor, 'POST', '/api/articles', { title, content: doc('x'), reviewDate })).body.id as string;
    const over = await mk('Overdue', d(-5)), soon = await mk('Soon', d(10)), later = await mk('Later', d(90));
    for (const id of [over, soon, later]) await c.req(c.editor, 'POST', `/api/articles/${id}/publish`);
    await mk('None', null);
    const arch = await mk('Archived', d(-1));
    await c.req(c.editor, 'POST', `/api/articles/${arch}/archive`);
    const r = await c.req(c.editor, 'GET', '/api/admin/review-due?days=30');
    expect(r.status).toBe(200);
    expect(r.body.articles.map((a: any) => a.id)).toEqual([over, soon]);
    expect(r.body.articles[0].overdue).toBe(true);
    expect(r.body.articles[1].overdue).toBe(false);
    expect((await c.req(c.admin, 'GET', '/api/admin/review-due?days=365')).body.articles.map((a: any) => a.id)).toContain(later);
    expect((await c.req(c.admin, 'GET', '/api/admin/review-due?days=abc')).status).toBe(400);
  });
});

describe('audit', () => {
  it('admin mutations are audited; list is newest-first and cursor paginated', async () => {
    await c.req(c.admin, 'POST', '/api/admin/allowlist', { email: 'n1@x.test' });
    await c.req(c.admin, 'PATCH', '/api/admin/settings', { requireApproval: true });
    await c.req(c.admin, 'PATCH', `/api/admin/users/${await uid('ed@x.test')}`, { role: 'viewer' });
    await c.req(c.admin, 'DELETE', '/api/admin/allowlist/n1%40x.test');
    const all = (await c.req(c.admin, 'GET', '/api/admin/audit?limit=200')).body.entries as any[];
    expect(all.slice(0, 4).map((e) => e.action)).toEqual(['allowlist.remove', 'user.update', 'settings.update', 'allowlist.add']);
    const p1 = (await c.req(c.admin, 'GET', '/api/admin/audit?limit=2')).body;
    expect(p1.entries).toHaveLength(2);
    expect(p1.nextCursor).toBeTruthy();
    const p2 = (await c.req(c.admin, 'GET', `/api/admin/audit?limit=2&cursor=${p1.nextCursor}`)).body;
    expect(p2.entries.map((e: any) => e.id)).toEqual(all.slice(2, 4).map((e) => e.id));
    expect((await c.req(c.admin, 'GET', '/api/admin/audit?limit=0')).status).toBe(400);
    expect((await c.req(c.admin, 'GET', '/api/admin/audit?cursor=zz')).status).toBe(400);
    expect(all[0].detail.summary).toBeTruthy();
  });
});

describe('fix round 1', () => {
  const patch = (id: string, b: unknown) => c.req(c.admin, 'PATCH', `/api/admin/users/${id}`, b);
  it('role:null clears the pin and re-resolves from allowlist', async () => {
    const id = await uid('ed@x.test');
    await patch(id, { role: 'viewer' });
    expect(await role(c.editor)).toBe('viewer');
    expect((await patch(id, { role: null })).status).toBe(200);
    expect(await role(c.editor)).toBe('editor');
    expect((await c.req(c.admin, 'GET', '/api/admin/users')).body.users.find((u: any) => u.id === id).roleSetByAdmin).toBe(false);
  });
  it('role:null that would resolve the last admin to viewer is 409; bootstrap too', async () => {
    const e2 = await uid('ed2@x.test'), boss = await uid('boss@x.test');
    await patch(e2, { role: 'admin' });
    c.app.sqlite.prepare('update users set active = 0 where id = ?').run(boss);
    expect((await c.req(c.editor2, 'PATCH', `/api/admin/users/${e2}`, { role: null })).status).toBe(409); // resolves to editor
    c.app.sqlite.prepare('update users set active = 1 where id = ?').run(boss);
    expect((await patch(boss, { role: null })).status).toBe(200); // bootstrap resolves to admin: no loss
    expect(await role(c.admin)).toBe('admin');
  });
  it('last admin with role:null resolving to viewer -> 409', async () => {
    const v = await uid('v@x.test');
    c.app.sqlite.prepare("update users set role='admin', role_set_by_admin=1 where id = ?").run(v);
    c.app.sqlite.prepare("update users set active=0 where email='boss@x.test'").run();
    expect((await c.req(c.viewer, 'PATCH', `/api/admin/users/${v}`, { role: null })).status).toBe(409);
  });
  it('pinned viewer stays viewer across allowlist remove + re-add', async () => {
    const id = await uid('ed@x.test');
    await patch(id, { role: 'viewer' });
    await c.req(c.admin, 'DELETE', '/api/admin/allowlist/ed%40x.test');
    await c.req(c.admin, 'POST', '/api/admin/allowlist', { email: 'ed@x.test' });
    expect(await role(c.editor)).toBe('viewer');
    expect(await role((await login('ed@x.test')).cookie)).toBe('viewer');
  });
  it('bootstrap email added to env later takes effect at next login', async () => {
    expect(await role(c.editor)).toBe('editor');
    c.app.config.adminBootstrapEmails.push('ed@x.test');
    expect(await role((await login('ed@x.test')).cookie)).toBe('admin');
  });
  it('allowlist DELETE normalises the email param, rejects invalid', async () => {
    await c.req(c.admin, 'POST', '/api/admin/allowlist', { email: 'tidy@x.test' });
    expect((await c.req(c.admin, 'DELETE', '/api/admin/allowlist/%20TIDY%40x.test')).status).toBe(200);
    expect((await c.req(c.admin, 'DELETE', '/api/admin/allowlist/not-an-email')).status).toBe(400);
  });
  it('audit summaries include side effects; unchanged settings write no audit row', async () => {
    await login('side@x.test');
    await c.req(c.admin, 'POST', '/api/admin/allowlist', { email: 'side@x.test' });
    await c.req(c.admin, 'DELETE', '/api/admin/allowlist/side%40x.test');
    await patch(await uid('ed@x.test'), { role: 'viewer' });
    await patch(await uid('ed@x.test'), { role: null });
    const e = (await c.req(c.admin, 'GET', '/api/admin/audit?limit=10')).body.entries.map((x: any) => x.detail.summary as string);
    expect(e[3]).toMatch(/promoted 1.*side@x\.test/);
    expect(e[2]).toMatch(/demoted 1.*side@x\.test/);
    expect(e[1]).toMatch(/roleSetByAdmin set/);
    expect(e[0]).toMatch(/roleSetByAdmin cleared/);
    await c.req(c.admin, 'PATCH', '/api/admin/settings', { requireApproval: true });
    const n = () => c.app.sqlite.prepare('select count(*) n from audit_log').get() as { n: number };
    const before = n().n;
    await c.req(c.admin, 'PATCH', '/api/admin/settings', { requireApproval: true });
    expect(n().n).toBe(before);
  });
  it('review-due lists published only', async () => {
    const past = '2020-01-01';
    const mk = async (title: string) => (await c.req(c.editor, 'POST', '/api/articles', { title, content: doc('x'), reviewDate: past })).body.id as string;
    const draft = await mk('D'), pub = await mk('P');
    await c.req(c.editor, 'POST', `/api/articles/${pub}/publish`);
    const ids = (await c.req(c.editor, 'GET', '/api/admin/review-due')).body.articles.map((a: any) => a.id);
    expect(ids).toEqual([pub]);
    expect(ids).not.toContain(draft);
  });
});

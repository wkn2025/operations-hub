import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, readdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildApp } from '../src/app';
import { setup, env, doc, type Ctx } from './helpers';

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32, 1)]);
const PDF = Buffer.from('%PDF-1.4\n%%EOF\n');
const HTML = Buffer.from('<html><script>alert(1)</script></html>');

function multipart(name: string, data: Buffer, type = 'application/octet-stream') {
  const b = '----t' + Math.random().toString(16).slice(2);
  const head = Buffer.from(`--${b}\r\nContent-Disposition: form-data; name="file"; filename="${name}"\r\nContent-Type: ${type}\r\n\r\n`);
  return { payload: Buffer.concat([head, data, Buffer.from(`\r\n--${b}--\r\n`)]), headers: { 'content-type': `multipart/form-data; boundary=${b}` } };
}

let c: Ctx, dir: string;
const upload = (cookie: string | undefined, name: string, data: Buffer, type?: string) => {
  const m = multipart(name, data, type);
  return c.app.inject({ method: 'POST', url: '/api/files', payload: m.payload, headers: { ...m.headers, ...(cookie ? { cookie } : {}) } });
};
const get = (cookie: string, url: string) => c.app.inject({ method: 'GET', url, headers: { cookie } });
const mk = async (content?: unknown) => (await c.req(c.editor, 'POST', '/api/articles', { title: 'A' + Math.random(), content })).body;

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'ops-up-'));
  c = await setup(dir);
});

describe('upload', () => {
  it('editor uploads png; viewer 403; anon 401', async () => {
    const r = await upload(c.editor, 'pic.png', PNG, 'image/png');
    expect(r.statusCode).toBe(201);
    const j = r.json();
    expect(j).toMatchObject({ name: 'pic.png', mime: 'image/png', size: PNG.length });
    expect(j.url).toBe(`/api/files/${j.id}`);
    expect((await upload(c.viewer, 'pic.png', PNG)).statusCode).toBe(403);
    expect((await upload(undefined, 'pic.png', PNG)).statusCode).toBe(401);
  });
  it('rejects html, svg, exe, js, and mismatched bytes', async () => {
    expect((await upload(c.editor, 'a.html', HTML, 'text/html')).statusCode).toBe(415);
    expect((await upload(c.editor, 'a.svg', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), 'image/svg+xml')).statusCode).toBe(415);
    expect((await upload(c.editor, 'a.exe', Buffer.from('MZ\x90\x00'), 'application/x-msdownload')).statusCode).toBe(415);
    expect((await upload(c.editor, 'a.js', Buffer.from('alert(1)'), 'text/javascript')).statusCode).toBe(415);
    expect((await upload(c.editor, 'a.png', HTML, 'image/png')).statusCode).toBe(415); // html bytes named .png
    expect((await upload(c.editor, 'a.pdf', PNG, 'application/pdf')).statusCode).toBe(415); // ext/bytes mismatch
    expect((await upload(c.editor, 'a.txt', HTML, 'text/plain')).statusCode).toBe(415); // html disguised as txt
    expect(existsSync(join(dir, 'uploads')) ? readdirSync(join(dir, 'uploads')).length : 0).toBe(0);
  });
  it('rejects oversize (>15MB)', async () => {
    const big = Buffer.concat([PNG, Buffer.alloc(15 * 1024 * 1024)]);
    expect((await upload(c.editor, 'big.png', big, 'image/png')).statusCode).toBe(413);
  });
  it('accepts pdf, txt, csv; sanitizes ../../evil.png and never uses it on disk', async () => {
    expect((await upload(c.editor, 'a.pdf', PDF)).statusCode).toBe(201);
    expect((await upload(c.editor, 'a.txt', Buffer.from('hello'))).statusCode).toBe(201);
    expect((await upload(c.editor, 'a.csv', Buffer.from('a,b\n1,2\n'))).statusCode).toBe(201);
    const r = await upload(c.editor, '../../evil.png', PNG, 'image/png');
    expect(r.statusCode).toBe(201);
    expect(r.json().name).toBe('evil.png');
    expect(readdirSync(join(dir, 'uploads')).some((f) => f.includes('evil'))).toBe(false);
    expect(existsSync(join(dir, '..', '..', 'evil.png'))).toBe(false);
  });
  it('audits upload', async () => {
    await upload(c.editor, 'p.png', PNG);
    expect((await c.req(c.admin, 'GET', '/api/admin/audit')).body.entries.some((e: any) => e.action === 'file.upload')).toBe(true);
  });
});

describe('serving', () => {
  it('image inline, pdf attachment, hardening headers', async () => {
    const img = (await upload(c.editor, 'p.png', PNG)).json(), pdf = (await upload(c.editor, 'my doc.pdf', PDF)).json();
    const g = await get(c.editor, img.url);
    expect(g.statusCode).toBe(200);
    expect(g.headers['content-type']).toBe('image/png');
    expect(g.headers['x-content-type-options']).toBe('nosniff');
    expect(g.headers['content-security-policy']).toContain("default-src 'none'");
    expect(String(g.headers['content-disposition'] ?? 'inline')).not.toMatch(/attachment/);
    expect(g.rawPayload.equals(PNG)).toBe(true);
    const p = await get(c.editor, pdf.url);
    expect(p.headers['content-disposition']).toMatch(/^attachment/);
    expect(p.headers['x-content-type-options']).toBe('nosniff');
  });
  it('anon 401; unknown 404', async () => {
    const f = (await upload(c.editor, 'p.png', PNG)).json();
    expect((await c.req(undefined, 'GET', f.url)).status).toBe(401);
    expect((await c.req(c.editor, 'GET', '/api/files/nope')).status).toBe(404);
  });
  it('viewer: only files in a PUBLISHED article (attached or embedded); unattached editor-only', async () => {
    const f = (await upload(c.editor, 'p.png', PNG)).json();
    expect((await get(c.viewer, f.url)).statusCode).toBe(404); // unattached
    const a = await mk();
    expect((await c.req(c.editor, 'POST', `/api/articles/${a.id}/files/${f.id}`)).status).toBe(200);
    expect((await get(c.viewer, f.url)).statusCode).toBe(404); // draft
    await c.req(c.editor, 'POST', `/api/articles/${a.id}/publish`);
    expect((await get(c.viewer, f.url)).statusCode).toBe(200);

    const f2 = (await upload(c.editor, 'q.png', PNG)).json();
    const b = await mk({ type: 'doc', content: [{ type: 'image', attrs: { src: f2.url } }] });
    expect((await get(c.viewer, f2.url)).statusCode).toBe(404);
    await c.req(c.editor, 'POST', `/api/articles/${b.id}/publish`);
    expect((await get(c.viewer, f2.url)).statusCode).toBe(200);
    await c.req(c.editor, 'POST', `/api/articles/${b.id}/archive`);
    expect((await get(c.viewer, f2.url)).statusCode).toBe(404);
  });
  it('embedded rows track content: removed image -> viewer 404 and admin delete works; restore re-syncs', async () => {
    const f = (await upload(c.editor, 'p.png', PNG)).json();
    const img = { type: 'doc', content: [{ type: 'image', attrs: { src: f.url } }] };
    const a = await mk(img);
    await c.req(c.editor, 'POST', `/api/articles/${a.id}/publish`);
    expect((await get(c.viewer, f.url)).statusCode).toBe(200);
    expect((await c.req(c.editor, 'DELETE', `/api/articles/${a.id}/files/${f.id}`)).status).toBe(409); // embedded-only
    const p = await c.req(c.editor, 'PATCH', `/api/articles/${a.id}`, { baseRevision: 1, content: doc('no image') });
    expect(p.status).toBe(200);
    expect((await get(c.viewer, f.url)).statusCode).toBe(404);
    expect((await c.req(c.admin, 'GET', '/api/admin/files')).body.files.find((x: any) => x.id === f.id).references).toBe(0);
    await c.req(c.editor, 'POST', `/api/articles/${a.id}/revisions/1/restore`);
    expect((await get(c.viewer, f.url)).statusCode).toBe(200);
    await c.req(c.editor, 'PATCH', `/api/articles/${a.id}`, { baseRevision: 3, content: doc('again') });
    expect((await c.req(c.admin, 'DELETE', `/api/admin/files/${f.id}`)).status).toBe(200);
  });
  it('explicit attachment survives content edits; embedding an attached file keeps it attached', async () => {
    const f = (await upload(c.editor, 'p.png', PNG)).json();
    const a = await mk(doc('x'));
    await c.req(c.editor, 'POST', `/api/articles/${a.id}/files/${f.id}`);
    await c.req(c.editor, 'PATCH', `/api/articles/${a.id}`, { baseRevision: 1, content: { type: 'doc', content: [{ type: 'image', attrs: { src: f.url } }] } });
    await c.req(c.editor, 'PATCH', `/api/articles/${a.id}`, { baseRevision: 2, content: doc('gone') });
    expect((await c.req(c.editor, 'GET', `/api/articles/${a.id}/files`)).body.files).toHaveLength(1);
  });
  it('attach then detach of a still-embedded image keeps viewer access until removed from content', async () => {
    const f = (await upload(c.editor, 'p.png', PNG)).json();
    const a = await mk({ type: 'doc', content: [{ type: 'image', attrs: { src: f.url } }] });
    await c.req(c.editor, 'POST', `/api/articles/${a.id}/publish`);
    await c.req(c.editor, 'POST', `/api/articles/${a.id}/files/${f.id}`);
    expect((await c.req(c.editor, 'DELETE', `/api/articles/${a.id}/files/${f.id}`)).status).toBe(200);
    expect((await get(c.viewer, f.url)).statusCode).toBe(200);
    await c.req(c.editor, 'PATCH', `/api/articles/${a.id}`, { baseRevision: 1, content: doc('none') });
    expect((await get(c.viewer, f.url)).statusCode).toBe(404);
  });
  it('requireApproval blocks editor PATCH of published before any file sync', async () => {
    const f = (await upload(c.editor, 'p.png', PNG)).json();
    const a = await mk(doc('x'));
    await c.req(c.editor, 'POST', `/api/articles/${a.id}/publish`);
    c.app.sqlite.prepare("insert into settings(key,value) values('requireApproval','true')").run();
    const r = await c.req(c.editor, 'PATCH', `/api/articles/${a.id}`, { baseRevision: 1, content: { type: 'doc', content: [{ type: 'image', attrs: { src: f.url } }] } });
    expect(r.status).toBe(403);
    expect(c.app.sqlite.prepare('select count(*) n from article_files').get()).toEqual({ n: 0 });
  });
  it('rejects empty upload; quote escaped in filename*; no-cache', async () => {
    expect((await upload(c.editor, 'e.txt', Buffer.alloc(0))).statusCode).toBe(400);
    const f = (await upload(c.editor, "it's.pdf", PDF)).json();
    const g = await get(c.editor, f.url);
    expect(g.headers['content-disposition']).toContain('it%27s.pdf');
    expect(g.headers['cache-control']).toBe('private, no-cache');
  });
  it('embedded image saved via PATCH is synced', async () => {
    const f = (await upload(c.editor, 'p.png', PNG)).json();
    const a = await mk(doc('x'));
    await c.req(c.editor, 'PATCH', `/api/articles/${a.id}`, { baseRevision: a.revision, content: { type: 'doc', content: [{ type: 'image', attrs: { src: f.url } }] } });
    expect((await c.req(c.editor, 'GET', `/api/articles/${a.id}/files`)).body.files.map((x: any) => x.id)).toEqual([f.id]);
  });
});

describe('attach / detach', () => {
  it('editor attaches, lists, detaches; viewer 403; requireApproval blocks published', async () => {
    const f = (await upload(c.editor, 'p.pdf', PDF)).json();
    const a = await mk();
    expect((await c.req(c.viewer, 'POST', `/api/articles/${a.id}/files/${f.id}`)).status).toBe(403);
    expect((await c.req(c.editor, 'POST', `/api/articles/${a.id}/files/${f.id}`)).status).toBe(200);
    expect((await c.req(c.editor, 'POST', `/api/articles/${a.id}/files/nope`)).status).toBe(404);
    expect((await c.req(c.editor, 'GET', `/api/articles/${a.id}/files`)).body.files[0]).toMatchObject({ id: f.id, name: 'p.pdf', mime: 'application/pdf' });
    expect((await c.req(c.editor, 'DELETE', `/api/articles/${a.id}/files/${f.id}`)).status).toBe(200);
    expect((await c.req(c.editor, 'GET', `/api/articles/${a.id}/files`)).body.files).toEqual([]);
    await c.req(c.editor, 'POST', `/api/articles/${a.id}/publish`);
    c.app.sqlite.prepare("insert into settings(key,value) values('requireApproval','true')").run();
    expect((await c.req(c.editor, 'POST', `/api/articles/${a.id}/files/${f.id}`)).status).toBe(403);
    expect((await c.req(c.admin, 'POST', `/api/articles/${a.id}/files/${f.id}`)).status).toBe(200);
  });
  it('viewer can list attachments of a published article only', async () => {
    const f = (await upload(c.editor, 'p.pdf', PDF)).json();
    const a = await mk();
    await c.req(c.editor, 'POST', `/api/articles/${a.id}/files/${f.id}`);
    expect((await c.req(c.viewer, 'GET', `/api/articles/${a.id}/files`)).status).toBe(404);
    await c.req(c.editor, 'POST', `/api/articles/${a.id}/publish`);
    expect((await c.req(c.viewer, 'GET', `/api/articles/${a.id}/files`)).body.files).toHaveLength(1);
  });
});

describe('admin files', () => {
  it('lists with ref count; delete blocked when referenced, else removes bytes+row, audited', async () => {
    const f = (await upload(c.editor, 'p.pdf', PDF)).json();
    const a = await mk();
    await c.req(c.editor, 'POST', `/api/articles/${a.id}/files/${f.id}`);
    expect((await c.req(c.editor, 'GET', '/api/admin/files')).status).toBe(403);
    expect((await c.req(c.admin, 'GET', '/api/admin/files')).body.files.find((x: any) => x.id === f.id).references).toBe(1);
    expect((await c.req(c.admin, 'DELETE', `/api/admin/files/${f.id}`)).status).toBe(409);
    await c.req(c.editor, 'DELETE', `/api/articles/${a.id}/files/${f.id}`);
    expect(readdirSync(join(dir, 'uploads')).length).toBe(1);
    expect((await c.req(c.admin, 'DELETE', `/api/admin/files/${f.id}`)).status).toBe(200);
    expect(readdirSync(join(dir, 'uploads')).length).toBe(0);
    expect((await c.req(c.admin, 'GET', f.url)).status).toBe(404);
    expect((await c.req(c.admin, 'DELETE', `/api/admin/files/${f.id}`)).status).toBe(404);
    expect((await c.req(c.admin, 'GET', '/api/admin/audit')).body.entries.some((e: any) => e.action === 'file.delete')).toBe(true);
  });
});

describe('persistence', () => {
  it('bytes survive restart on same DATA_DIR', async () => {
    const d = mkdtempSync(join(tmpdir(), 'ops-persist-'));
    const e = { ...env, DATA_DIR: d };
    const a1 = await buildApp({ env: e });
    const login = async (app: typeof a1) => ([(await app.inject({ method: 'POST', url: '/api/auth/dev/login', payload: { email: 'boss@x.test' } })).headers['set-cookie']].flat()[0] as string).split(';')[0];
    const m = multipart('p.png', PNG);
    const up = await a1.inject({ method: 'POST', url: '/api/files', payload: m.payload, headers: { ...m.headers, cookie: await login(a1) } });
    expect(up.statusCode).toBe(201);
    await a1.close();
    const a2 = await buildApp({ env: e });
    const g = await a2.inject({ method: 'GET', url: up.json().url, headers: { cookie: await login(a2) } });
    expect(g.statusCode).toBe(200);
    expect(g.rawPayload.equals(PNG)).toBe(true);
    await a2.close();
  });
});

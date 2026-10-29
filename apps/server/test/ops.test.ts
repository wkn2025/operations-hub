import { describe, it, expect, beforeAll } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { crc32, inflateRawSync } from 'node:zlib';
import Database from 'better-sqlite3';
import { PM_NODES } from '@ops/shared';
import { buildApp } from '../src/app';
import { setup, env, type Ctx } from './helpers';
import { seedDemo } from '../src/seed/base';
import { zip } from '../src/services/zip';
import { backup, readUploads } from '../src/services/backup';
import { exportEntries, pmToMarkdown, writeExport } from '../src/services/export';

/** Independent zip reader (central directory -> local header -> inflate), so the writer is checked against the format, not itself. */
function unzip(buf: Buffer): Map<string, Buffer> {
  const out = new Map<string, Buffer>();
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  expect(eocd).toBeGreaterThanOrEqual(0);
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  for (let i = 0; i < count; i++) {
    expect(buf.readUInt32LE(p)).toBe(0x02014b50);
    const method = buf.readUInt16LE(p + 10), crc = buf.readUInt32LE(p + 16), csize = buf.readUInt32LE(p + 20);
    const nlen = buf.readUInt16LE(p + 28), xlen = buf.readUInt16LE(p + 30), clen = buf.readUInt16LE(p + 32), off = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + nlen).toString('utf8');
    expect(buf.readUInt32LE(off)).toBe(0x04034b50);
    const start = off + 30 + buf.readUInt16LE(off + 26) + buf.readUInt16LE(off + 28);
    const raw = buf.subarray(start, start + csize);
    const data = method === 8 ? inflateRawSync(raw) : Buffer.from(raw);
    expect(crc32(data) >>> 0, name).toBe(crc);
    out.set(name, data);
    p += 46 + nlen + xlen + clen;
  }
  return out;
}

describe('zip writer', () => {
  it('round-trips names (incl. utf-8), empty and binary entries', () => {
    const bin = Buffer.from(Array.from({ length: 5000 }, (_, i) => (i * 7) % 256));
    const z = zip([{ name: 'a.txt', data: Buffer.from('hello hello hello') }, { name: 'dir/é.bin', data: bin }, { name: 'empty', data: Buffer.alloc(0) }]);
    const m = unzip(z);
    expect([...m.keys()]).toEqual(['a.txt', 'dir/é.bin', 'empty']);
    expect(m.get('a.txt')!.toString()).toBe('hello hello hello');
    expect(m.get('dir/é.bin')!.equals(bin)).toBe(true);
    expect(m.get('empty')!.length).toBe(0);
  });
});

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32, 1)]);
function multipart(name: string, data: Buffer) {
  const b = '----t' + Math.random().toString(16).slice(2);
  const head = Buffer.from(`--${b}\r\nContent-Disposition: form-data; name="file"; filename="${name}"\r\nContent-Type: image/png\r\n\r\n`);
  return { payload: Buffer.concat([head, data, Buffer.from(`\r\n--${b}--\r\n`)]), headers: { 'content-type': `multipart/form-data; boundary=${b}` } };
}

describe('backup and export on the seeded demo database', () => {
  let c: Ctx, dataDir: string;
  beforeAll(async () => {
    dataDir = mkdtempSync(join(tmpdir(), 'ops-bk-'));
    c = await setup(dataDir);
    await seedDemo(c.app);
    const m = multipart('extra.png', PNG);
    expect((await c.app.inject({ method: 'POST', url: '/api/files', payload: m.payload, headers: { ...m.headers, cookie: c.editor } })).statusCode).toBe(201);
  });
  const tables = (db: Database.Database) =>
    (db.prepare("select name from sqlite_master where type = 'table' and name not like 'sqlite_%' order by name").all() as { name: string }[]).map((t) => t.name);
  const counts = (db: Database.Database) => Object.fromEntries(tables(db).map((t) => [t, (db.prepare(`select count(*) n from "${t}"`).get() as { n: number }).n]));

  it('backup: app.db opens, passes integrity_check and has the same row count in every table; uploads.zip has every upload byte-identical', async () => {
    const out = mkdtempSync(join(tmpdir(), 'ops-bk-out-'));
    const r = await backup(c.app.sqlite, dataDir, out);
    expect(readdirSync(r.dir).sort()).toEqual(['app.db', 'uploads.zip']);
    const copy = new Database(join(r.dir, 'app.db'), { readonly: true, fileMustExist: true });
    expect(copy.pragma('integrity_check', { simple: true })).toBe('ok');
    const live = counts(c.app.sqlite);
    expect(Object.keys(live)).toContain('articles');
    expect(live.articles).toBeGreaterThanOrEqual(30);
    expect(counts(copy)).toEqual(live);
    copy.close();
    const uploads = readdirSync(join(dataDir, 'uploads'));
    expect(uploads.length).toBeGreaterThanOrEqual(6); // 5 seed screenshots + extra.png
    const z = unzip(readFileSync(join(r.dir, 'uploads.zip')));
    expect([...z.keys()].sort()).toEqual(uploads.map((u) => `uploads/${u}`).sort());
    for (const u of uploads) expect(z.get(`uploads/${u}`)!.equals(readFileSync(join(dataDir, 'uploads', u))), u).toBe(true);
    expect(r.counts).toEqual(live);
  });

  it('backup: an upload that vanishes between listing and reading is skipped and reported, not fatal', () => {
    const up = join(dataDir, 'uploads');
    const present = readdirSync(up)[0]!;
    const r = readUploads(up, [present, 'deleted-mid-backup']);
    expect(r.entries.map((e) => e.name)).toEqual([`uploads/${present}`]);
    expect(r.missing).toEqual(['deleted-mid-backup']);
  });

  it('export: every published slug has a .md and a .json; drafts are included with their status; index lists all', () => {
    const entries = exportEntries(c.app.sqlite, dataDir);
    const names = new Set(entries.map((e) => e.name));
    const published = (c.app.sqlite.prepare("select slug from articles where status = 'published'").all() as { slug: string }[]).map((r) => r.slug);
    expect(published.length).toBeGreaterThanOrEqual(30);
    for (const s of published) {
      expect(names.has(`articles/${s}.md`), s).toBe(true);
      expect(names.has(`articles/${s}.json`), s).toBe(true);
    }
    expect([...names].filter((n) => n.startsWith('files/')).length).toBeGreaterThanOrEqual(5); // seeded screenshots used by articles
    expect([...names].filter((n) => n.startsWith('flows/')).length).toBe(3);
    const index = JSON.parse(String(entries.find((e) => e.name === 'index.json')!.data));
    expect(index.articles.length).toBe((c.app.sqlite.prepare('select count(*) n from articles').get() as { n: number }).n);
    const one = JSON.parse(String(entries.find((e) => e.name === `articles/${published[0]}.json`)!.data));
    expect(one).toMatchObject({ slug: published[0], status: 'published' });
    expect(one.content.type).toBe('doc');
    const md = String(entries.find((e) => e.name === `articles/${published[0]}.md`)!.data);
    expect(md).toMatch(/^---\n/);
    expect(md).toContain(`# ${one.title}`);
  });

  it('writeExport writes the same entries under <out>/<timestamp>/', () => {
    const out = mkdtempSync(join(tmpdir(), 'ops-ex-out-'));
    const dir = writeExport(c.app.sqlite, dataDir, out);
    expect(dir.startsWith(out)).toBe(true);
    const files = readdirSync(join(dir, 'articles'));
    expect(files.length).toBe(exportEntries(c.app.sqlite, dataDir).filter((e) => e.name.startsWith('articles/')).length);
  });

  it('GET /api/admin/export: anonymous 401, viewer/editor 403, admin gets a zip of the export', async () => {
    expect((await c.req(undefined, 'GET', '/api/admin/export')).status).toBe(401);
    expect((await c.req(c.viewer, 'GET', '/api/admin/export')).status).toBe(403);
    expect((await c.req(c.editor, 'GET', '/api/admin/export')).status).toBe(403);
    const r = await c.app.inject({ method: 'GET', url: '/api/admin/export', headers: { cookie: c.admin } });
    expect(r.statusCode).toBe(200);
    expect(r.headers['content-type']).toBe('application/zip');
    expect(r.headers['content-disposition']).toMatch(/^attachment; filename="operations-hub-export-.*\.zip"$/);
    const z = unzip(r.rawPayload);
    for (const s of (c.app.sqlite.prepare("select slug from articles where status = 'published'").all() as { slug: string }[]))
      expect(z.has(`articles/${s.slug}.md`), s.slug).toBe(true);
    const audit = c.app.sqlite.prepare("select action from audit_log where action = 'export.download'").all();
    expect(audit.length).toBe(1);
  });
});

describe('ProseMirror -> Markdown', () => {
  const t = (text: string, marks?: { type: string; attrs?: Record<string, unknown> }[]) => ({ type: 'text', text, ...(marks ? { marks } : {}) });
  const p = (...c: unknown[]) => ({ type: 'paragraph', content: c });
  it('converts every supported node and mark', () => {
    const d = {
      type: 'doc', content: [
        { type: 'heading', attrs: { level: 2 }, content: [t('Title')] },
        p(t('b', [{ type: 'bold' }]), t(' '), t('i', [{ type: 'italic' }]), t(' '), t('c', [{ type: 'code' }]), t(' '), t('s', [{ type: 'strike' }]), t(' '),
          t('u', [{ type: 'underline' }]), t(' '), t('h', [{ type: 'highlight' }]), t(' '), t('web', [{ type: 'link', attrs: { href: 'https://x.test/a' } }]),
          { type: 'hardBreak' }, t('next'), t(' '), { type: 'internalLink', attrs: { articleId: 'A2', label: 'Other' } }),
        { type: 'bulletList', content: [{ type: 'listItem', content: [p(t('one'))] }, { type: 'listItem', content: [p(t('two')), { type: 'bulletList', content: [{ type: 'listItem', content: [p(t('nested'))] }] }] }] },
        { type: 'orderedList', attrs: { start: 3 }, content: [{ type: 'listItem', content: [p(t('three'))] }, { type: 'listItem', content: [p(t('four'))] }] },
        { type: 'taskList', content: [{ type: 'taskItem', attrs: { checked: true }, content: [p(t('done'))] }, { type: 'taskItem', attrs: { checked: false }, content: [p(t('todo'))] }] },
        { type: 'blockquote', content: [p(t('quoted'))] },
        { type: 'codeBlock', attrs: { language: 'sql' }, content: [t('select 1;')] },
        { type: 'horizontalRule' },
        { type: 'callout', attrs: { kind: 'warning', title: 'Careful' }, content: [p(t('hot'))] },
        { type: 'collapsible', attrs: { title: 'More' }, content: [p(t('hidden'))] },
        { type: 'steps', content: [{ type: 'step', attrs: { title: 'Open' }, content: [p(t('Open Globo'))] }, { type: 'step', content: [p(t('Search'))] }] },
        { type: 'table', content: [
          { type: 'tableRow', content: [{ type: 'tableHeader', content: [p(t('K'))] }, { type: 'tableHeader', content: [p(t('V|x'))] }] },
          { type: 'tableRow', content: [{ type: 'tableCell', content: [p(t('a'))] }, { type: 'tableCell', content: [p(t('b'))] }] },
        ] },
        { type: 'image', attrs: { src: '/api/files/f1', alt: 'Screen', title: 'Caption' } },
      ],
    };
    const md = pmToMarkdown(d, { slugs: { A2: 'other-slug' }, files: { f1: 'f1.png' } });
    expect(md).toContain('## Title');
    expect(md).toContain('**b** *i* `c` ~~s~~ <u>u</u> ==h== [web](https://x.test/a)  \nnext [Other](./other-slug.md)');
    expect(md).toContain('- one\n- two\n  - nested');
    expect(md).toContain('3. three\n4. four');
    expect(md).toContain('- [x] done\n- [ ] todo');
    expect(md).toContain('> quoted');
    expect(md).toContain('```sql\nselect 1;\n```');
    expect(md).toContain('\n---\n');
    expect(md).toContain('> [!WARNING] Careful\n> hot');
    expect(md).toContain('<details>\n<summary>More</summary>\n\nhidden\n\n</details>');
    expect(md).toContain('1. **Open**\n\n   Open Globo\n2. Search');
    expect(md).toContain('| K | V\\|x |\n| --- | --- |\n| a | b |');
    expect(md).toContain('![Screen](../files/f1.png "Caption")');
    // every node name the editor can produce is handled (no "unsupported" fallthrough)
    for (const n of Object.values(PM_NODES)) expect(md, n).not.toContain(`<!-- unsupported: ${n} -->`);
    expect(pmToMarkdown({ type: 'doc', content: [{ type: 'mystery' }] })).toContain('<!-- unsupported: mystery -->');
    expect(pmToMarkdown(null)).toBe('');
  });
  it('neutralises raw HTML and comment breakouts', () => {
    expect(pmToMarkdown({ type: 'doc', content: [p(t('<script>x</script> & <b>'))] }).trim()).toBe('&lt;script>x&lt;/script> &amp; &lt;b>');
    const md = pmToMarkdown({ type: 'doc', content: [{ type: 'x --> <img src=y onerror=alert(1)>' }] });
    expect(md).not.toContain('<img');
    expect(md.match(/-->/g)).toHaveLength(1);
  });
  it('escapes markdown control characters in text', () => {
    expect(pmToMarkdown({ type: 'doc', content: [p(t('1. not a list *not bold* [x](y)'))] }).trim()).toBe('1\\. not a list \\*not bold\\* \\[x\\](y)');
  });
  it('link hrefs pass a safeHref-equivalent; code languages and image urls/titles cannot break out', () => {
    const link = (href: string) => pmToMarkdown({ type: 'doc', content: [p({ type: 'text', text: 'go', marks: [{ type: 'link', attrs: { href } }] })] }).trim();
    expect(link('javascript:alert(1)')).toBe('go');
    expect(link('data:text/html,x')).toBe('go');
    expect(link('//evil.example')).toBe('go');
    expect(link('https://ok.example/a b(c)')).toBe('[go](https://ok.example/a%20b%28c%29)');
    expect(link('mailto:a@x.test')).toBe('[go](mailto:a@x.test)');
    expect(link('jav&#x61;script:alert(1)')).toBe('[go](jav%26#x61;script:alert%281%29)'); // no entity a Markdown viewer could decode
    expect(link('https://ok.example/?a=1&b=2')).toBe('[go](https://ok.example/?a=1%26b=2)');
    const code = pmToMarkdown({ type: 'doc', content: [{ type: 'codeBlock', attrs: { language: 'js\n<script>' }, content: [t('x')] }] });
    expect(code.split('\n')[0]).toBe('```');
    expect(pmToMarkdown({ type: 'doc', content: [{ type: 'codeBlock', attrs: { language: 'c++' }, content: [t('x')] }] }).split('\n')[0]).toBe('```c++');
    const img = pmToMarkdown({ type: 'doc', content: [{ type: 'image', attrs: { src: '/api/files/f1', alt: 'a', title: 'x") [y](javascript:z' } }] }, { files: { f1: 'f(1).png' } }).trim();
    expect(img).toBe('![a](../files/f%281%29.png "x\\"\\) [y]\\(javascript:z")');
    expect(pmToMarkdown({ type: 'doc', content: [{ type: 'image', attrs: { src: 'javascript:alert(1)', alt: 'a' } }] }).trim()).toBe('a');
  });
});

describe('serving the built web app', () => {
  let dist: string;
  beforeAll(() => {
    dist = mkdtempSync(join(tmpdir(), 'ops-dist-'));
    mkdirSync(join(dist, 'assets'));
    writeFileSync(join(dist, 'index.html'), '<!doctype html><div id="root"></div><script type="module" src="/assets/app-abc123.js"></script>');
    writeFileSync(join(dist, 'assets', 'app-abc123.js'), 'console.log(1)');
    writeFileSync(join(dist, 'favicon.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
  });
  const app = () => buildApp({ dbPath: ':memory:', env: { ...env, WEB_DIST: dist } });

  it('serves index.html at / and as SPA fallback for deep links, with no-cache and security headers', async () => {
    const a = await app();
    for (const url of ['/', '/articles/some-slug', '/admin/users?x=1']) {
      const r = await a.inject({ url, headers: { accept: 'text/html' } });
      expect(r.statusCode, url).toBe(200);
      expect(r.headers['content-type'], url).toMatch(/^text\/html/);
      expect(r.body).toContain('<div id="root">');
      expect(r.headers['cache-control']).toBe('no-cache');
      const csp = String(r.headers['content-security-policy']);
      expect(csp).toContain("default-src 'self'");
      expect(csp).toContain("script-src 'self'");
      expect(csp).toContain("img-src 'self' data: blob:");
      expect(csp).toContain("frame-ancestors 'none'");
      expect(csp).toContain("object-src 'none'");
      expect(r.headers['x-content-type-options']).toBe('nosniff');
      expect(r.headers['referrer-policy']).toBe('same-origin');
      expect(r.headers['x-frame-options']).toBe('DENY');
    }
  });
  it('hashed assets are immutable; other files are revalidated; HEAD works', async () => {
    const a = await app();
    const js = await a.inject({ url: '/assets/app-abc123.js' });
    expect(js.statusCode).toBe(200);
    expect(js.headers['content-type']).toMatch(/^text\/javascript/);
    expect(js.headers['cache-control']).toBe('public, max-age=31536000, immutable');
    const svg = await a.inject({ url: '/favicon.svg' });
    expect(svg.headers['content-type']).toMatch(/^image\/svg\+xml/);
    expect(svg.headers['cache-control']).toBe('no-cache');
    expect((await a.inject({ method: 'HEAD', url: '/' })).statusCode).toBe(200);
  });
  it('/api stays the API: unknown /api paths are JSON 404, never index.html; missing assets 404; traversal never escapes dist', async () => {
    const a = await app();
    const r = await a.inject({ url: '/api/does-not-exist', headers: { accept: 'text/html' } });
    expect(r.statusCode).toBe(404);
    expect(r.headers['content-type']).toMatch(/application\/json/);
    expect((await a.inject({ url: '/api/me' })).json()).toHaveProperty('user', null);
    expect((await a.inject({ url: '/assets/missing-999.js' })).statusCode).toBe(404);
    for (const url of ['/../package.json', '/%2e%2e/%2e%2e/package.json', '/assets/..%2f..%2fpackage.json']) {
      const t = await a.inject({ url });
      expect(t.body, url).not.toContain('"name"');
    }
    expect((await a.inject({ method: 'POST', url: '/somewhere' })).statusCode).toBe(404);
  });
  it('without WEB_DIST (and outside production) nothing is served at /', async () => {
    const a = await buildApp({ dbPath: ':memory:', env });
    expect((await a.inject({ url: '/' })).statusCode).toBe(404);
  });
  it('API responses carry nosniff/referrer/frame headers; the files route keeps its own stricter CSP', async () => {
    const a = await buildApp({ dbPath: ':memory:', env });
    const r = await a.inject({ url: '/api/me' });
    expect(r.headers['x-content-type-options']).toBe('nosniff');
    expect(r.headers['referrer-policy']).toBe('same-origin');
    expect(String(r.headers['content-security-policy'])).toContain("frame-ancestors 'none'");
  });
});

describe('session cookie Secure flag', () => {
  const oenv = (nodeEnv: string) => ({
    AUTH_MODE: 'oidc', NODE_ENV: nodeEnv, SESSION_SECRET: 'x'.repeat(40), ADMIN_BOOTSTRAP_EMAILS: '',
    OIDC_ISSUER: 'https://idp.example', OIDC_CLIENT_ID: 'c', OIDC_CLIENT_SECRET: 's', OIDC_REDIRECT_URI: 'https://hub.example/api/auth/callback',
  });
  const fake = { authorizationUrl: async (p: { state: string }) => new URL(`https://idp.example/a?state=${p.state}`), exchange: async () => ({ email: 'sso@x.test', name: 'S' }) };
  const sidCookie = async (nodeEnv: string) => {
    const a = await buildApp({ dbPath: ':memory:', env: oenv(nodeEnv), oidcClient: fake as any });
    const r = await a.inject({ url: '/api/auth/login' });
    const tx = [r.headers['set-cookie']].flat()[0]!;
    const state = new URL(r.headers.location as string).searchParams.get('state');
    const cb = await a.inject({ url: `/api/auth/callback?code=1&state=${state}`, headers: { cookie: tx.split(';')[0] } });
    return { tx, sid: ([cb.headers['set-cookie']].flat() as string[]).find((s) => s.startsWith('sid='))! };
  };
  it('is Secure whenever AUTH_MODE=oidc, even if NODE_ENV is not production', async () => {
    for (const ne of ['production', 'development']) {
      const { sid, tx } = await sidCookie(ne);
      expect(sid, ne).toMatch(/; Secure/i);
      expect(tx, ne).toMatch(/; Secure/i);
    }
  });
  it('is not Secure in dev mode (plain http://localhost demo)', async () => {
    const a = await buildApp({ dbPath: ':memory:', env });
    const r = await a.inject({ method: 'POST', url: '/api/auth/dev/login', payload: { email: 'a@x.test' } });
    expect(String([r.headers['set-cookie']].flat()[0])).not.toMatch(/Secure/i);
  });
});


import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

// Acceptance criteria from the spec, end to end against the real API (dev auth, seeded DEMO data).
// Runs serially: later tests use the article created in the editor test.
test.describe.configure({ mode: 'serial' });

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const CONTROL = `http://127.0.0.1:${process.env.E2E_CONTROL_PORT ?? 3102}`;
const TOKEN = `zebracrossing${Date.now().toString(36)}`; // unique body-only word for search

const loginAs = async (page: Page, email: string) => {
  const r = await page.request.post('/api/auth/dev/login', { data: { email } });
  expect(r.ok()).toBeTruthy();
};
const saved = (page: Page) => expect(page.locator('[data-save-state=saved]')).toBeVisible({ timeout: 15_000 });
const sidebar = (page: Page) => page.getByRole('navigation', { name: 'Primary' });
/** Kill the API process and start a fresh one on the same DATA_DIR (see e2e/start-api.mjs). */
const restartApi = async (request: APIRequestContext) => {
  const r = await request.post(`${CONTROL}/restart`, { timeout: 90_000 });
  expect(r.status(), await r.text()).toBe(200);
};
const searchIds = async (request: APIRequestContext, q: string) => {
  const r = await request.get(`/api/search?q=${encodeURIComponent(q)}`);
  expect(r.status()).toBe(200);
  return ((await r.json()).groups as { kind: string; hits: { id: string; title: string }[] }[]).flatMap((g) => g.hits.map((h) => ({ ...h, kind: g.kind })));
};

let created: { id: string; slug: string; title: string; fileSrc: string } | undefined;

test('viewer browses a category to an article and finds an article by body text with Ctrl+K', async ({ page }) => {
  await loginAs(page, 'viewer@demo.test');
  await page.goto('/');
  await sidebar(page).getByRole('link', { name: 'EDI & Automation' }).click();
  await expect(page).toHaveURL(/\/category\//);
  await page.getByRole('main').getByRole('link', { name: /EDI 101: the three files and the loop/ }).first().click();
  await expect(page.getByRole('heading', { level: 1, name: 'EDI 101: the three files and the loop' })).toBeVisible();

  // "savings analysis" only occurs in the body (the MacroHealth callout), never in the title
  await page.goto('/');
  await page.keyboard.press('Control+K');
  await page.getByRole('combobox', { name: 'Search' }).fill('savings analysis');
  const hit = page.getByRole('option', { name: /EDI 101: the three files and the loop/ });
  await expect(hit).toBeVisible();
  await expect(hit.locator('mark').first()).toBeVisible(); // highlighted snippet from the body
  await hit.click();
  await expect(page.getByRole('heading', { level: 1, name: 'EDI 101: the three files and the loop' })).toBeVisible();
});

test('editor creates and publishes an article with a screenshot and an internal link; it survives reload and an API restart', async ({ page }) => {
  await loginAs(page, 'editor@demo.test');
  await page.goto('/edit/new?type=standard');
  const title = `Acceptance article ${Date.now()}`;
  await page.getByLabel('Article title').fill(title);
  await expect(page).toHaveURL(/\/edit\/[0-9a-f-]{36}$/, { timeout: 15_000 });
  const id = page.url().split('/').pop()!;

  const body = page.getByRole('textbox', { name: 'Article text' });
  await body.click();
  await page.keyboard.type(`Version one mentions ${TOKEN}. Related: `);
  await page.getByRole('toolbar', { name: 'Insert' }).getByRole('button', { name: 'Link to article' }).click();
  await page.getByRole('combobox', { name: 'Link to an article' }).fill('EDI 101');
  await page.getByRole('option', { name: /EDI 101: the three files and the loop/ }).click();
  await page.locator('input[aria-label="Upload image"]').setInputFiles({ name: 'acceptance-screen.png', mimeType: 'image/png', buffer: PNG });
  await expect(body.locator('img[src^="/api/files/"]')).toHaveCount(1);
  await body.locator('img').click();
  await page.getByLabel('Image description').fill('Acceptance screenshot');
  await page.keyboard.press('Control+S');
  await saved(page);
  await page.getByRole('button', { name: 'Publish' }).click();
  await expect.poll(async () => (await (await page.request.get(`/api/articles/${id}`)).json()).status).toBe('published');

  // edit: second explicit checkpoint
  await body.click();
  await page.keyboard.press('Control+End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Version two paragraph.');
  await page.keyboard.press('Control+S');
  await saved(page);

  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Article text' })).toContainText('Version two paragraph.');

  const art = await (await page.request.get(`/api/articles/${id}`)).json();
  const fileSrc = await page.getByRole('textbox', { name: 'Article text' }).locator('img').getAttribute('src');
  created = { id, slug: art.slug, title, fileSrc: fileSrc! };

  await restartApi(page.request);

  // same browser session still valid (sessions are signed cookies checked against the DB) and the content is intact
  await page.reload();
  const after = page.getByRole('textbox', { name: 'Article text' });
  await expect(after).toContainText(`Version one mentions ${TOKEN}.`);
  await expect(after).toContainText('Version two paragraph.');
  await expect(after.locator('[data-internal-link]')).toHaveText(/EDI 101/);
  await expect(page.getByLabel('Article title')).toHaveValue(title);
});

test('after the restart a viewer sees the article: screenshot loads, internal link works, search finds body text', async ({ page }) => {
  test.skip(!created, 'needs the article from the editor test');
  await loginAs(page, 'viewer@demo.test');
  await page.goto(`/article/${created!.slug}`);
  await expect(page.getByRole('heading', { level: 1, name: created!.title })).toBeVisible();
  const img = page.getByRole('img', { name: 'Acceptance screenshot' });
  await expect(img).toBeVisible();
  await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true);
  const file = await page.request.get(created!.fileSrc);
  expect(file.status()).toBe(200);
  expect(file.headers()['content-type']).toBe('image/png');

  const hits = await searchIds(page.request, TOKEN);
  expect(hits.map((h) => h.id)).toContain(created!.id);

  await page.getByRole('main').getByRole('link', { name: /EDI 101: the three files and the loop/ }).first().click();
  await expect(page.getByRole('heading', { level: 1, name: 'EDI 101: the three files and the loop' })).toBeVisible();
});

test('editor restores an earlier revision from History', async ({ page }) => {
  test.skip(!created, 'needs the article from the editor test');
  await loginAs(page, 'editor@demo.test');
  await page.goto(`/edit/${created!.id}`);
  const body = page.getByRole('textbox', { name: 'Article text' });
  await expect(body).toContainText('Version two paragraph.');
  // the newest revision that has version one but none of the version-two edit (autosaves of a published article each cut one)
  const revs = (await (await page.request.get(`/api/articles/${created!.id}/revisions`)).json()).revisions as { rev: number }[];
  let target: number | undefined;
  for (const { rev } of revs) {
    const c = JSON.stringify((await (await page.request.get(`/api/articles/${created!.id}/revisions/${rev}`)).json()).content);
    if (c.includes(TOKEN) && !c.includes('Version tw')) { target = rev; break; }
  }
  expect(target, 'a revision before the version-two edit').toBeDefined();
  await page.getByRole('button', { name: 'History' }).click();
  await page.getByRole('button', { name: `View revision ${target}`, exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText(TOKEN);
  await expect(dialog).not.toContainText('Version two paragraph.');
  await dialog.getByRole('button', { name: 'Restore this version' }).click();
  await dialog.getByRole('button', { name: `Restore revision ${target}` }).click();
  await expect(page.getByRole('status')).toContainText(/Restored/);
  await expect(body).not.toContainText('Version two paragraph.');
  await expect(body).toContainText(TOKEN);
  const art = await (await page.request.get(`/api/articles/${created!.id}`)).json();
  expect(JSON.stringify(art.content)).not.toContain('Version two paragraph.');
});

test('admin renames a seeded category; a viewer sees the new name; name restored', async ({ page, browser }) => {
  await loginAs(page, 'admin@demo.test');
  await page.goto('/admin/categories');
  const old = 'Provider Networks & Partners', renamed = 'Provider Networks & Partners (renamed)';
  await page.getByRole('button', { name: `Rename ${old}` }).click();
  const input = page.getByRole('textbox', { name: 'Category name' });
  await input.fill(renamed);
  await input.press('Enter');
  await expect(sidebar(page).getByRole('link', { name: renamed })).toBeVisible();

  const viewerCtx = await browser.newContext();
  const viewer = await viewerCtx.newPage();
  await loginAs(viewer, 'viewer@demo.test');
  await viewer.goto('/');
  await expect(sidebar(viewer).getByRole('link', { name: renamed })).toBeVisible();
  await viewerCtx.close();

  await page.getByRole('button', { name: `Rename ${renamed}` }).click();
  await page.getByRole('textbox', { name: 'Category name' }).fill(old);
  await page.getByRole('textbox', { name: 'Category name' }).press('Enter');
  await expect(sidebar(page).getByRole('link', { name: old, exact: true })).toBeVisible();
});

test('viewer cannot bypass the UI: API returns 401/403/404 for everything outside published content', async ({ page, playwright }) => {
  // fixtures, made by editor/admin through the API
  const ed = await playwright.request.newContext({ baseURL: 'http://localhost:5174' });
  expect((await ed.post('/api/auth/dev/login', { data: { email: 'editor@demo.test' } })).ok()).toBeTruthy();
  const mk = async (title: string, text: string) => (await (await ed.post('/api/articles', { data: { title, content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] } } })).json()) as { id: string; slug: string };
  const secret = `secretdraft${Date.now().toString(36)}`;
  const draft = await mk(`Bypass draft ${Date.now()}`, secret);
  const review = await mk(`Bypass in review ${Date.now()}`, secret);
  expect((await ed.post(`/api/articles/${review.id}/submit`)).ok()).toBeTruthy();
  const archived = await mk(`Bypass archived ${Date.now()}`, secret);
  expect((await ed.post(`/api/articles/${archived.id}/publish`)).ok()).toBeTruthy();
  expect((await ed.post(`/api/articles/${archived.id}/archive`)).ok()).toBeTruthy();
  const pub = await mk(`Bypass published ${Date.now()}`, 'public text');
  expect((await ed.post(`/api/articles/${pub.id}/publish`)).ok()).toBeTruthy();
  const up = async () => (await (await ed.post('/api/files', { multipart: { file: { name: 'x.png', mimeType: 'image/png', buffer: PNG } } })).json()) as { id: string };
  const orphan = await up(); // linked to nothing
  const draftFile = await up();
  expect((await ed.post(`/api/articles/${draft.id}/files/${draftFile.id}`)).ok()).toBeTruthy();
  const pubFile = await up();
  expect((await ed.post(`/api/articles/${pub.id}/files/${pubFile.id}`)).ok()).toBeTruthy();
  const draftFlow = (await (await ed.post('/api/flows', { data: { title: `Bypass flow ${Date.now()}` } })).json()) as { id: string };
  await ed.dispose();

  // anonymous reads nothing
  const anon = await playwright.request.newContext({ baseURL: 'http://localhost:5174' });
  for (const url of ['/api/articles', `/api/articles/${pub.id}`, '/api/categories', '/api/search?q=claim', `/api/files/${pubFile.id}`, '/api/flows'])
    expect((await anon.get(url)).status(), `anon GET ${url}`).toBe(401);
  await anon.dispose();

  await loginAs(page, 'viewer@demo.test');
  const r = page.request;
  const me = (await (await r.get('/api/me')).json()).user;
  const cats = (await (await r.get('/api/categories')).json()).categories as { id: string }[];
  const status = async (method: string, url: string, data?: unknown) =>
    (await r.fetch(url, { method, ...(data !== undefined ? { data } : {}) })).status();

  const notFound: [string, string][] = [
    ['GET', `/api/articles/${draft.id}`], ['GET', `/api/articles/${draft.slug}`], ['GET', `/api/articles/${review.id}`], ['GET', `/api/articles/${archived.id}`],
    ['GET', `/api/articles/${draft.id}/revisions`], ['GET', `/api/articles/${pub.id}/revisions`], ['GET', `/api/articles/${draft.id}/revisions/1`],
    ['GET', `/api/articles/${draft.id}/backlinks`], ['GET', `/api/articles/${draft.id}/files`],
    ['GET', `/api/files/${orphan.id}`], ['GET', `/api/files/${draftFile.id}`], ['GET', `/api/flows/${draftFlow.id}`],
  ];
  for (const [m, u] of notFound) expect(await status(m, u), `${m} ${u}`).toBe(404);

  const forbidden: [string, string, unknown?][] = [
    ['POST', '/api/articles', { title: 'x' }], ['PATCH', `/api/articles/${pub.id}`, { baseRevision: 1, title: 'hacked' }],
    ...(['submit', 'publish', 'archive', 'restore', 'reject'] as const).map((a): [string, string] => ['POST', `/api/articles/${pub.id}/${a}`]),
    ['POST', `/api/articles/${draft.id}/publish`], ['POST', `/api/articles/${pub.id}/revisions/1/restore`],
    ['POST', '/api/files'], ['POST', `/api/articles/${pub.id}/files/${orphan.id}`], ['DELETE', `/api/articles/${pub.id}/files/${pubFile.id}`],
    ['POST', '/api/categories', { name: 'x' }], ['PATCH', `/api/categories/${cats[0]!.id}`, { name: 'x' }], ['POST', '/api/categories/reorder', { ids: [] }],
    ['POST', '/api/flows', { title: 'x' }], ['PATCH', `/api/flows/${draftFlow.id}`, { baseRevision: 1, title: 'x' }],
    ['GET', '/api/tags'], ['GET', '/api/owners'],
    ['GET', '/api/admin/users'], ['PATCH', `/api/admin/users/${me.id}`, { role: 'admin' }], ['GET', '/api/admin/allowlist'], ['POST', '/api/admin/allowlist', { email: me.email }],
    ['DELETE', '/api/admin/allowlist/editor%40demo.test'], ['GET', '/api/admin/settings'], ['PATCH', '/api/admin/settings', { requireApproval: false }],
    ['GET', '/api/admin/audit'], ['GET', '/api/admin/files'], ['DELETE', `/api/admin/files/${orphan.id}`], ['GET', '/api/admin/review-due'], ['GET', '/api/admin/export'],
  ];
  for (const [m, u, d] of forbidden) expect(await status(m, u, d), `${m} ${u}`).toBe(403);

  // what a viewer may see: published only, everywhere
  expect(await status('GET', `/api/articles/${pub.id}`)).toBe(200);
  expect(await status('GET', `/api/files/${pubFile.id}`)).toBe(200);
  for (const s of ['draft', 'in_review', 'archived']) {
    const list = (await (await r.get(`/api/articles?status=${s}&limit=200`)).json()).articles as { status: string }[];
    expect(list.every((a) => a.status === 'published'), `?status=${s}`).toBe(true);
  }
  expect((await searchIds(r, secret)).length).toBe(0);
  // still a viewer, nothing changed
  expect((await (await r.get('/api/me')).json()).user.role).toBe('viewer');
  expect((await (await r.get(`/api/articles/${pub.id}`)).json()).title).toMatch(/^Bypass published/);
});

test('viewer runs a troubleshooting flow to completion', async ({ page }) => {
  await loginAs(page, 'viewer@demo.test');
  await page.goto('/flows');
  await page.getByRole('link', { name: 'EDI claim failed to import' }).first().click();
  await expect(page.getByRole('heading', { name: 'Does the Member ID on the invoice exist in Globo?' })).toBeVisible();
  await page.getByRole('button', { name: /Yes/ }).click();
  await expect(page.getByRole('heading', { name: 'Is the invoice on the Missing Claim page in web.transformer?' })).toBeVisible();
  await page.keyboard.press('2');
  await expect(page.getByRole('heading', { name: 'Is the invoice on the Missing GOP page in web.transformer?' })).toBeVisible();
  await page.keyboard.press('2');
  await expect(page.getByRole('heading', { name: 'Is the invoice on the Manual Handling page?' })).toBeVisible();
  await page.keyboard.press('2');
  await expect(page.getByRole('link', { name: /Open full article/ })).toHaveAttribute('href', '/article/web-transformer-all-entries');
  await page.getByRole('button', { name: 'Start over' }).first().click();
  await page.keyboard.press('2');
  await expect(page.getByTestId('flow-result')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'The invoice was automatically denied.' })).toBeVisible();
});

test('every top-level category (and the sidebar entry for it) has published content a viewer can open', async ({ page }) => {
  await loginAs(page, 'viewer@demo.test');
  const cats = (await (await page.request.get('/api/categories')).json()).categories as { id: string; parentId: string | null; name: string; slug: string; archived: boolean }[];
  const top = cats.filter((c) => !c.parentId && !c.archived);
  expect(top.length).toBe(9);
  const arts = (await (await page.request.get('/api/articles?limit=200')).json()).articles as { categoryId: string | null }[];
  const topOf = (id: string | null): string | undefined => { const c = cats.find((k) => k.id === id); return c ? (c.parentId ? topOf(c.parentId) : c.id) : undefined; };
  for (const t of top) {
    await page.goto(`/category/${t.slug}`);
    await expect(page.getByRole('heading', { level: 1, name: t.name })).toBeVisible();
    if (t.name === 'Diagnosis & Service codes') { // a lookup page, not articles: several codes, five separators, dots optional
      await page.getByRole('searchbox', { name: 'Codes' }).fill('s330xxa, 99214 - A4565-S33.0XXA ZZZ99');
      const rows = page.getByRole('list', { name: 'Code results' }).getByRole('listitem');
      await expect(rows).toHaveCount(4);
      await expect(rows.nth(0)).toContainText('S33.0XXA');
      await expect(rows.nth(1)).toContainText('Office visit');
      await expect(rows.nth(2)).toContainText('Arm sling');
      await expect(rows.nth(3)).toContainText('No match');
      continue;
    }
    expect(arts.filter((a) => topOf(a.categoryId) === t.id).length, t.name).toBeGreaterThan(0);
    if (t.name === 'Clients & Terms and Conditions') { // A–Z client directory: client -> line -> document
      const main = page.getByRole('main');
      await main.getByRole('button', { name: 'Bluefin Corporate Health' }).click();
      await main.getByRole('button', { name: 'Travel', exact: true }).click();
      await main.getByRole('link', { name: 'Coverage summary' }).click();
      await expect(page.getByRole('heading', { level: 1, name: 'Bluefin Business Travel: coverage summary' })).toBeVisible();
      continue;
    }
    await expect(page.getByRole('main').locator('a[href^="/article/"]').first(), t.name).toBeVisible();
  }
});

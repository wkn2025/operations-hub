import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const loginAs = async (page: Page, email: string) => {
  const r = await page.request.post('/api/auth/dev/login', { data: { email } });
  expect(r.ok()).toBeTruthy();
};
const shot = async (page: Page, name: string) => { // SCREENSHOTS=1 refreshes docs/screenshots
  if (!process.env.SCREENSHOTS) return;
  mkdirSync('docs/screenshots', { recursive: true });
  await page.waitForTimeout(700);
  await page.screenshot({ path: `docs/screenshots/${name}.png` });
};
const sidebar = (page: Page) => page.getByRole('navigation', { name: 'Primary' });

test('admin renames a category and the sidebar updates without a reload; archive hides it', async ({ page }) => {
  await loginAs(page, 'admin@demo.test');
  const name = `E2E category ${Date.now()}`;
  const created = await page.request.post('/api/categories', { data: { name, sortOrder: 99 } });
  expect(created.status()).toBe(201);

  await page.goto('/admin/categories');
  await expect(sidebar(page).getByRole('link', { name })).toBeVisible();
  await page.evaluate(() => { (window as any).__sameDocument = true; });

  await page.getByRole('button', { name: `Rename ${name}` }).click();
  const input = page.getByRole('textbox', { name: 'Category name' });
  await input.fill(`${name} renamed`);
  await input.press('Enter');
  await expect(sidebar(page).getByRole('link', { name: `${name} renamed` })).toBeVisible();
  expect(await page.evaluate(() => (window as any).__sameDocument)).toBe(true); // no reload happened
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot(page, '26-admin-categories');

  // keyboard-accessible reorder: move up changes the order the sidebar shows
  const before = await sidebar(page).getByRole('link').allTextContents();
  await page.getByRole('button', { name: `Move ${name} renamed up` }).click();
  await expect.poll(async () => (await sidebar(page).getByRole('link').allTextContents()).join('|')).not.toBe(before.join('|'));

  await page.getByRole('button', { name: `Archive ${name} renamed` }).click();
  await expect(sidebar(page).getByRole('link', { name: `${name} renamed` })).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).__sameDocument)).toBe(true);
});

test('editor opening /admin/users sees a forbidden state; admin nav is admin-only; bootstrap admin cannot demote itself', async ({ page }) => {
  await loginAs(page, 'editor@demo.test');
  await page.goto('/');
  await expect(sidebar(page).getByRole('link', { name: 'Admin' })).toHaveCount(0);
  await page.goto('/admin/users');
  await expect(page.getByRole('heading', { name: 'Admins only' })).toBeVisible();
  await expect(page).toHaveURL(/\/admin\/users$/); // no redirect loop
  expect((await page.request.get('/api/admin/users')).status()).toBe(403);

  await loginAs(page, 'admin@demo.test');
  await page.goto('/');
  await sidebar(page).getByRole('link', { name: 'Admin' }).click();
  await expect(page).toHaveURL(/\/admin\/users$/);
  const row = page.getByRole('row', { name: /admin@demo\.test/ });
  await expect(row).toBeVisible();
  await shot(page, '25-admin-users');
  await row.getByRole('combobox', { name: /Role for/ }).selectOption('viewer');
  await expect(row.getByRole('alert')).toContainText(/bootstrap admin/i);
  await expect(row.getByRole('combobox', { name: /Role for/ })).toHaveValue('admin');
});

test('an archived article appears in Archive and can be restored', async ({ page }) => {
  await loginAs(page, 'admin@demo.test');
  const title = `E2E archived ${Date.now()}`;
  const a = await (await page.request.post('/api/articles', { data: { title } })).json();
  expect((await page.request.post(`/api/articles/${a.id}/archive`)).ok()).toBeTruthy();

  await page.goto('/admin/archive');
  const row = page.getByRole('row', { name: new RegExp(title) });
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: `Restore ${title}` }).click();
  await expect(page.getByRole('row', { name: new RegExp(title) })).toHaveCount(0);
  expect((await (await page.request.get(`/api/articles/${a.id}`)).json()).status).toBe('draft');

  // the review queue lists submitted work with publish/reject
  const sub = await (await page.request.post('/api/articles', { data: { title: `${title} review` } })).json();
  await page.request.post(`/api/articles/${sub.id}/submit`);
  await page.goto('/admin/review');
  const reviewRow = page.getByRole('row', { name: new RegExp(`${title} review`) });
  await expect(reviewRow).toBeVisible();
  await shot(page, '27-admin-review');
  await reviewRow.getByRole('button', { name: `Reject ${title} review` }).click();
  await expect(page.getByRole('row', { name: new RegExp(`${title} review`) })).toHaveCount(0);
  expect((await (await page.request.get(`/api/articles/${sub.id}`)).json()).status).toBe('draft');
});

test('admin drags categories: drop before, after and inside another one', async ({ page }) => {
  await loginAs(page, 'admin@demo.test');
  const t = Date.now(), [A, B, C] = ['A', 'B', 'C'].map((x) => `Drag ${x} ${t}`) as [string, string, string];
  const id: Record<string, string> = {};
  for (const [i, n] of [A, B, C].entries()) id[n] = (await (await page.request.post('/api/categories', { data: { name: n, sortOrder: 200 + i } })).json()).id;
  await page.goto('/admin/categories');
  const row = (n: string) => page.locator(`[data-category="${n}"]`);
  const order = async () => (await sidebar(page).getByRole('link').allTextContents()).filter((s) => s.includes(String(t))).join(' | ');
  const drag = async (from: string, to: string, pos: 'before' | 'after' | 'inside') => {
    const src = (await row(from).boundingBox())!, dst = (await row(to).boundingBox())!;
    const y = pos === 'before' ? 4 : pos === 'after' ? dst.height - 4 : dst.height / 2;
    await row(from).dragTo(row(to), { sourcePosition: { x: 20, y: src.height / 2 }, targetPosition: { x: 200, y } });
  };
  await expect.poll(order).toBe(`${A} | ${B} | ${C}`);

  await drag(C, A, 'before');
  await expect.poll(order).toBe(`${C} | ${A} | ${B}`);
  await expect(row(C)).toHaveAttribute('draggable', 'true'); // move finished: drag re-enabled
  await drag(A, B, 'after');
  await expect.poll(order).toBe(`${C} | ${B} | ${A}`);
  await expect(row(A)).toHaveAttribute('draggable', 'true');
  await drag(C, B, 'inside');
  await expect.poll(async () => {
    const cats = (await (await page.request.get('/api/categories')).json()).categories as { id: string; parentId: string | null }[];
    return cats.find((c) => c.id === id[C])?.parentId;
  }).toBe(id[B]);
  await expect.poll(order).toBe(`${B} | ${A}`); // C now lives under B (collapsed in the sidebar)
});

test('an expired session during an admin write goes to /login like the rest of the app', async ({ page }) => {
  await loginAs(page, 'admin@demo.test');
  await page.goto('/admin/users');
  await expect(page.getByRole('row', { name: /viewer@demo\.test/ })).toBeVisible();
  await page.request.post('/api/auth/logout'); // same cookie jar as the page: the session is now gone
  await page.getByRole('button', { name: 'Deactivate viewer@demo.test' }).click();
  await expect(page).toHaveURL(/\/login\?next=%2Fadmin%2Fusers/);
});

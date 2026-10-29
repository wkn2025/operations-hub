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

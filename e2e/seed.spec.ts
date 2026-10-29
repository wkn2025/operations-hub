import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const shot = async (page: Page, name: string) => { // SCREENSHOTS=1 refreshes docs/screenshots
  if (!process.env.SCREENSHOTS) return;
  mkdirSync('docs/screenshots', { recursive: true });
  await page.waitForTimeout(700);
  await page.screenshot({ path: `docs/screenshots/${name}.png`, fullPage: true });
};

const articles: [string, string, string][] = [
  ['macrohealth-edi-837p-and-837i-exchange', 'MacroHealth EDI: 837P and 837I exchange', '28-seed-technical-macrohealth'],
  ['approve-a-claim-for-payment', 'Approve a claim for payment', '29-seed-work-instruction-approval'],
  ['bluefin-corporate-health-coverage-summary', 'Bluefin Corporate Health: coverage summary', '30-seed-client-terms-bluefin'],
];

test('seeded DEMO articles render with screenshots, tables and working internal links', async ({ page }) => {
  expect((await page.request.post('/api/auth/dev/login', { data: { email: 'viewer@demo.test' } })).ok()).toBeTruthy();
  for (const [slug, title, name] of articles) {
    await page.goto(`/article/${slug}`);
    await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
    await expect(page.getByText('DEMO content').first()).toBeVisible();
    await expect(page.locator('table').first()).toBeVisible();
    await shot(page, name);
  }
  // embedded SVG screenshot actually loads
  await page.goto(`/article/${articles[0]![0]}`);
  const img = page.getByRole('img', { name: /MacroHealth Exchange portal/ });
  await expect(img).toBeVisible();
  expect(await img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true);
  // internal link navigates to another seeded article
  await page.getByRole('link', { name: 'MacroHealth file not picked up' }).first().click();
  await expect(page.getByRole('heading', { level: 1, name: 'MacroHealth file not picked up' })).toBeVisible();
});

test('seeded articles with empty table cells open in the editor', async ({ page }) => {
  expect((await page.request.post('/api/auth/dev/login', { data: { email: 'admin@demo.test' } })).ok()).toBeTruthy();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  for (const slug of ['bluefin-corporate-health-coverage-summary', 'working-with-assistance-partners']) {
    const { id } = await (await page.request.get(`/api/articles/${slug}`)).json();
    await page.goto(`/edit/${id}`);
    const editor = page.locator('[contenteditable=true]').first();
    await expect(editor).toBeVisible();
    await expect(editor.locator('table').first()).toBeVisible();
  }
  expect(errors).toEqual([]);
});

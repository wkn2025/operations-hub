import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const shot = async (page: Page, name: string) => { // SCREENSHOTS=1 refreshes docs/screenshots
  if (!process.env.SCREENSHOTS) return;
  mkdirSync('docs/screenshots', { recursive: true });
  await page.waitForTimeout(700);
  await page.screenshot({ path: `docs/screenshots/${name}.png`, fullPage: true });
};

const articles: [string, string, string][] = [
  ['edi-101-the-three-files-and-the-loop', 'EDI 101: the three files and the loop', '28-seed-technical-edi-101'], // real procedure: no DEMO label
  ['reimbursement-from-document-intake-to-proof-of-payment', 'Reimbursement: from document intake to proof of payment', '29-seed-work-instruction-approval'],
  ['bluefin-corporate-health-full-terms-and-conditions', 'Bluefin Corporate Health: full terms and conditions', '30-seed-client-terms-bluefin'],
];

test('seeded articles render with screenshots, tables and working internal links; DEMO label except on the real EDI procedure', async ({ page }) => {
  expect((await page.request.post('/api/auth/dev/login', { data: { email: 'viewer@demo.test' } })).ok()).toBeTruthy();
  for (const [slug, title, name] of articles) {
    await page.goto(`/article/${slug}`);
    await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
    if (slug.startsWith('edi-101')) await expect(page.getByText('DEMO content')).toHaveCount(0);
    else await expect(page.getByText('DEMO content').first()).toBeVisible();
    await expect(page.locator('table').first()).toBeVisible();
    await shot(page, name);
  }
  // embedded SVG screenshot actually loads
  await page.goto(`/article/${articles[0]![0]}`);
  const img = page.getByRole('img', { name: /The EDI loop across three organisations/ });
  await expect(img).toBeVisible();
  expect(await img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true);
  // internal link navigates to another seeded article
  await page.getByRole('main').getByRole('link', { name: 'Importing EDI invoices into Globo: the three checks' }).first().click();
  await expect(page.getByRole('heading', { level: 1, name: 'Importing EDI invoices into Globo: the three checks' })).toBeVisible();
});

test('seeded articles with empty table cells open in the editor', async ({ page }) => {
  expect((await page.request.post('/api/auth/dev/login', { data: { email: 'admin@demo.test' } })).ok()).toBeTruthy();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  for (const slug of ['bluefin-corporate-health-full-terms-and-conditions', 'working-with-assistance-partners']) {
    const { id } = await (await page.request.get(`/api/articles/${slug}`)).json();
    await page.goto(`/edit/${id}`);
    const editor = page.locator('[contenteditable=true]').first();
    await expect(editor).toBeVisible();
    await expect(editor.locator('table').first()).toBeVisible();
  }
  expect(errors).toEqual([]);
});

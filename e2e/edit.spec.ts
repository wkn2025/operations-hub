import { expect, test, type Page } from '@playwright/test';

// 1×1 PNG (the server sniffs magic bytes, so it must be a real image)
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

const loginAs = async (page: Page, email: string) => {
  const r = await page.request.post('/api/auth/dev/login', { data: { email } });
  expect(r.ok()).toBeTruthy();
};
const saved = (page: Page) => expect(page.locator('[data-save-state=saved]')).toBeVisible({ timeout: 15_000 });

test('editor creates an article from a template with an image and an internal link; it survives a reload', async ({ page }) => {
  await loginAs(page, 'editor@demo.test');
  await page.goto('/');
  await page.getByRole('link', { name: 'New article' }).first().click();
  await expect(page).toHaveURL(/\/edit\/new/);
  await page.getByRole('button', { name: /Work instruction/ }).click();

  const title = `E2E work instruction ${Date.now()}`;
  await page.getByLabel('Article title').fill(title);
  // the first change creates the draft and swaps the URL to /edit/<id>
  await expect(page).toHaveURL(/\/edit\/[0-9a-f-]{36}$/, { timeout: 15_000 });

  const body = page.getByRole('textbox', { name: 'Article text' });
  await body.click();
  await page.keyboard.press('Control+End');
  await page.keyboard.type('Written by the end-to-end test. See ');

  // internal link via the toolbar picker
  await page.getByRole('toolbar', { name: 'Insert' }).getByRole('button', { name: 'Link to article' }).click();
  await page.getByRole('combobox', { name: 'Link to an article' }).fill('Northwind');
  await page.getByRole('option', { name: /Northwind Travel Insurance/ }).click();
  await expect(body.locator('[data-internal-link]')).toHaveText(/Northwind Travel Insurance/);

  // image upload via the hidden file input behind the toolbar button
  await page.locator('input[aria-label="Upload image"]').setInputFiles({ name: 'claim-screen.png', mimeType: 'image/png', buffer: PNG });
  await expect(body.locator('img[src^="/api/files/"]')).toHaveCount(1);
  await expect(body.locator('img')).toHaveAttribute('alt', 'claim screen');

  // template field
  await page.getByLabel('Purpose').fill('Prove that editing persists.');
  await saved(page);

  await page.reload();
  await expect(page.getByLabel('Article title')).toHaveValue(title);
  const after = page.getByRole('textbox', { name: 'Article text' });
  await expect(after).toContainText('Written by the end-to-end test.');
  await expect(after.locator('img[src^="/api/files/"]')).toHaveCount(1);
  await expect(after.locator('[data-internal-link]')).toHaveText(/Northwind Travel Insurance/);
  await expect(page.getByLabel('Purpose')).toHaveValue('Prove that editing persists.');

  // the uploaded image is actually served
  const src = await after.locator('img').getAttribute('src');
  const img = await page.request.get(src!);
  expect(img.status()).toBe(200);
  expect(img.headers()['content-type']).toBe('image/png');

  // edit again
  await after.click();
  await page.keyboard.press('Control+End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Second edit.');
  await saved(page);

  // preview renders the work-instruction template
  await page.getByRole('button', { name: 'Preview' }).click();
  await expect(page.locator('[data-template=work_instruction]')).toBeVisible();
  await expect(page.locator('[data-template=work_instruction]').getByRole('link', { name: /Northwind Travel Insurance/ })).toBeVisible();
  await page.getByRole('button', { name: 'Preview' }).click();

  // version history
  await page.getByRole('button', { name: 'History' }).click();
  await expect(page.getByRole('button', { name: /View revision 1$/ })).toBeVisible();
  await page.getByRole('button', { name: /View revision 1$/ }).click();
  await expect(page.getByRole('dialog').getByRole('heading', { name: 'Revision 1' })).toBeVisible();
  await page.keyboard.press('Escape');

  // the article page shows the saved draft to editors
  await page.goto('/');
  await page.goBack();
  await expect(page.getByLabel('Article title')).toHaveValue(title);
});

test('viewers cannot open the editor', async ({ page }) => {
  await loginAs(page, 'viewer@demo.test');
  await page.goto('/edit/new');
  await expect(page.getByText(/only editors and admins/i)).toBeVisible();
});

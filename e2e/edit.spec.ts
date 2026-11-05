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
  await page.getByRole('option', { name: /Northwind Travel Insurance: coverage summary/ }).click();
  await expect(body.locator('[data-internal-link]')).toHaveText(/Northwind Travel Insurance/);

  // image upload via the hidden file input behind the toolbar button
  await page.locator('input[aria-label="Upload image"]').setInputFiles({ name: 'claim-screen.png', mimeType: 'image/png', buffer: PNG });
  await expect(body.locator('img[src^="/api/files/"]')).toHaveCount(1);
  await expect(body.locator('img')).toHaveAttribute('alt', ''); // flagged as missing until described
  await body.locator('img').click();
  await expect(page.getByText(/No description yet/)).toBeVisible();
  await page.getByLabel('Image description').fill('Claim screen in Globo');
  await expect(body.locator('img')).toHaveAttribute('alt', 'Claim screen in Globo');

  // template field
  await page.getByLabel('Purpose').fill('Prove that editing persists.');
  await saved(page);

  await page.reload();
  await expect(page.getByLabel('Article title')).toHaveValue(title);
  const after = page.getByRole('textbox', { name: 'Article text' });
  await expect(after).toContainText('Written by the end-to-end test.');
  await expect(after.locator('img[src^="/api/files/"]')).toHaveCount(1);
  await expect(after.locator('[data-internal-link]')).toHaveText(/Northwind Travel Insurance/);
  await expect(after.locator('img')).toHaveAttribute('alt', 'Claim screen in Globo');
  await expect(page.getByLabel('Purpose')).toHaveValue('Prove that editing persists.');

  // the uploaded image is actually served
  const src = await after.locator('img').getAttribute('src');
  const img = await page.request.get(src!);
  expect(img.status()).toBe(200);
  expect(img.headers()['content-type']).toBe('image/png');

  // two explicit checkpoints (Ctrl+S) with an edit in between
  await after.click();
  await page.keyboard.press('Control+End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Checkpoint A.');
  await page.keyboard.press('Control+S');
  await saved(page);
  await page.keyboard.type(' Checkpoint B.');
  await page.keyboard.press('Control+S');
  await saved(page);
  await expect(after).toContainText('Checkpoint A. Checkpoint B.');

  // preview renders the work-instruction template
  await page.getByRole('button', { name: 'Preview' }).click();
  await expect(page.locator('[data-template=work_instruction]')).toBeVisible();
  await expect(page.locator('[data-template=work_instruction]').getByRole('link', { name: /Northwind Travel Insurance/ })).toBeVisible();
  await page.getByRole('button', { name: 'Preview' }).click();

  // version history: >= 2 revisions; open the checkpoint before B read-only, then restore it
  await page.getByRole('button', { name: 'History' }).click();
  const items = page.getByRole('button', { name: /^View revision \d+$/ });
  await expect(items.nth(1)).toBeVisible();
  expect(await items.count()).toBeGreaterThanOrEqual(2);
  await items.nth(1).click(); // newest first: [B checkpoint, A checkpoint, ...]
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Checkpoint A.');
  await expect(dialog).not.toContainText('Checkpoint B.');
  await expect(dialog.locator('[contenteditable=true]')).toHaveCount(0); // read-only rendering
  await dialog.getByRole('button', { name: 'Restore this version' }).click();
  await dialog.getByRole('button', { name: /^Restore revision \d+$/ }).click();
  await expect(page.getByRole('status')).toContainText(/Restored/);
  await expect(after).toContainText('Checkpoint A.');
  await expect(after).not.toContainText('Checkpoint B.');
  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Article text' })).not.toContainText('Checkpoint B.');

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

test('keyboard: Alt+F10 reaches the formatting toolbar, arrows rove, Escape returns to the text', async ({ page }) => {
  await loginAs(page, 'editor@demo.test');
  await page.goto('/edit/new?type=standard');
  await page.getByLabel('Article title').fill('Keyboard check');
  const body = page.getByRole('textbox', { name: 'Article text' });
  await body.click();
  await page.keyboard.type('format me');
  await page.keyboard.press('Shift+Home');
  await page.keyboard.press('Alt+F10');
  const bar = page.getByRole('toolbar', { name: 'Formatting' });
  await expect(bar.getByRole('button', { name: 'Bold' })).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(bar.getByRole('button', { name: 'Italic' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(body.locator('em')).toHaveText('format me');
  await page.keyboard.press('Escape');
  await expect(body).toBeFocused();
  await page.keyboard.press('Control+Shift+K');
  await expect(page.getByRole('combobox', { name: 'Link to an article' })).toBeVisible();
});

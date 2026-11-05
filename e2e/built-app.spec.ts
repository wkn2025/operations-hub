import { expect, test, type Page } from '@playwright/test';

// The production build served by the API itself (WEB_DIST, port 3103; see playwright.config.ts), so the app runs under the
// real Content-Security-Policy. Any CSP violation or console error fails the test. (The other specs run on Vite, without CSP.)
test.use({ baseURL: 'http://localhost:3103' });

const watch = async (page: Page) => {
  const problems: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') problems.push(`console: ${m.text()}`); });
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  await page.addInitScript(() => document.addEventListener('securitypolicyviolation', (e) =>
    console.error(`CSP violation: ${e.violatedDirective} blocked ${e.blockedURI}`)));
  return problems;
};

test('built app under the production CSP: home, article with screenshot, editor and flow runner, no violations', async ({ page }) => {
  const problems = await watch(page);
  expect((await page.request.post('/api/auth/dev/login', { data: { email: 'editor@demo.test' } })).ok()).toBeTruthy();

  const home = await page.goto('/');
  expect(home!.headers()['content-security-policy']).toContain("script-src 'self'");
  expect(home!.headers()['content-security-policy']).toContain("img-src 'self' data: blob:");
  await expect(page.getByRole('navigation', { name: 'Primary' })).toBeVisible();

  await page.goto('/article/edi-101-the-three-files-and-the-loop'); // deep link: SPA fallback
  await expect(page.getByRole('heading', { level: 1, name: 'EDI 101: the three files and the loop' })).toBeVisible();
  const img = page.getByRole('img', { name: /The EDI loop across three organisations/ });
  await expect(img).toBeVisible();
  await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true);

  const { id } = await (await page.request.get('/api/articles/edi-101-the-three-files-and-the-loop')).json();
  await page.goto(`/edit/${id}`); // lazy chunk + Tiptap
  const body = page.getByRole('textbox', { name: 'Article text' });
  await expect(body).toBeVisible();
  await expect(body.locator('table').first()).toBeVisible();

  await page.goto('/flows/edi-claim-failed-to-import');
  await expect(page.getByRole('heading', { name: 'Does the Member ID on the invoice exist in Globo?' })).toBeVisible();
  await page.getByRole('button', { name: /Yes/ }).first().click();
  await expect(page.getByRole('heading', { name: 'Is the invoice on the Missing Claim page in web.transformer?' })).toBeVisible();

  expect(problems).toEqual([]);
});

test('built app: the CSP check itself works (an inline script is reported)', async ({ page }) => {
  const problems = await watch(page);
  await page.goto('/login');
  await page.evaluate(() => { const s = document.createElement('script'); s.textContent = 'window.__x = 1'; document.body.append(s); });
  await expect.poll(() => problems.some((p) => p.includes('CSP violation: script-src'))).toBe(true);
});

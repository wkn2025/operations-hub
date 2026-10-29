import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const loginAs = async (page: Page, email: string) => {
  const r = await page.request.post('/api/auth/dev/login', { data: { email } });
  expect(r.ok()).toBeTruthy();
};
const saved = (page: Page) => expect(page.locator('[data-save-state=saved]')).toBeVisible({ timeout: 15_000 });
const shot = async (page: Page, name: string) => { // SCREENSHOTS=1 refreshes docs/screenshots
  if (!process.env.SCREENSHOTS) return;
  mkdirSync('docs/screenshots', { recursive: true });
  await page.waitForTimeout(700); // let the spring settle
  await page.screenshot({ path: `docs/screenshots/${name}.png` });
};
const heading = (page: Page, name: string) => expect(page.getByRole('heading', { name })).toBeVisible();

test('viewer runs the EDI flow to a result, goes back and restarts; cannot edit', async ({ page }) => {
  await loginAs(page, 'viewer@demo.test');
  await page.goto('/flows');
  await shot(page, '17-flows-list');
  await page.getByRole('link', { name: 'EDI claim failed to import' }).first().click();
  await expect(page).toHaveURL(/\/flows\/edi-claim-failed-to-import$/);
  await heading(page, 'Is there a GOP for this case?');
  await shot(page, '18-flow-question');

  await page.getByRole('button', { name: /Yes/ }).click();
  await heading(page, 'Does the member ID on the claim match the policy record?');
  await page.getByRole('button', { name: /Yes, they match/ }).click();
  await heading(page, 'Is there an open case with the same member and an admission date within 3 days?');
  await page.keyboard.press('1'); // keyboard: first answer
  await heading(page, 'Did the clearinghouse reject the file with a 999?');
  await shot(page, '19-flow-trail');
  await page.keyboard.press('2');
  await heading(page, 'Everything checks out. Re-queue the claim.');
  await expect(page.getByTestId('flow-result')).toHaveAttribute('data-severity', 'success');
  await shot(page, '20-flow-result');

  await page.keyboard.press('Backspace');
  await heading(page, 'Did the clearinghouse reject the file with a 999?');
  await page.getByRole('button', { name: /^1. Yes/ }).click(); // 999 rejected -> article step with an inline preview
  await expect(page.getByRole('link', { name: /Open full article/ })).toHaveAttribute('href', '/article/999-implementation-acknowledgement');
  await shot(page, '21-flow-article');

  await page.getByRole('button', { name: 'Start over' }).first().click();
  await heading(page, 'Is there a GOP for this case?');

  // the troubleshooting article exposes the flow
  await page.goto('/article/edi-claim-failed-to-import');
  await expect(page.getByRole('link', { name: /Start guided flow/ })).toHaveAttribute('href', '/flows/edi-claim-failed-to-import');

  // viewers: no edit page, no writes
  await page.goto('/flows/edi-claim-failed-to-import/edit');
  await expect(page.getByRole('heading', { name: /Editing isn.t available/ })).toBeVisible();
  const list = await (await page.request.get('/api/flows')).json();
  const f = list.flows[0];
  expect((await page.request.patch(`/api/flows/${f.id}`, { data: { baseRevision: 1, title: 'x' } })).status()).toBe(403);
  expect((await page.request.post('/api/flows', { data: { title: 'x' } })).status()).toBe(403);
  expect((await page.request.post(`/api/flows/${f.id}/archive`)).status()).toBe(403);
});

test('editor builds a flow, fixes a validation error, publishes; a viewer runs it', async ({ page }) => {
  await loginAs(page, 'editor@demo.test');
  await page.goto('/flows');
  await page.getByRole('link', { name: 'New flow' }).click();
  const title = `E2E printer flow ${Date.now()}`;
  await page.getByLabel('Flow title').fill(title);
  await page.getByRole('button', { name: 'Create flow' }).click();
  await expect(page).toHaveURL(/\/flows\/[0-9a-f-]{36}\/edit$/);
  await expect(page.getByLabel('Flow title')).toHaveValue(title);

  // point the first answer at a new question; that question is a dead end until it has answers
  const q1 = page.locator('#node-q1');
  await q1.getByLabel('Answer 1 goes to').selectOption('__new:question');
  await expect(page.locator('#node-q2')).toBeVisible();
  const card = page.locator('#node-q2');
  await card.getByRole('textbox', { name: 'Question', exact: true }).fill('Is the printer powered on?');

  const checks = page.getByRole('list', { name: 'Problems' });
  await expect(checks).toContainText(/dead end/);
  await expect(page.getByRole('tab', { name: /Checks/ })).toContainText('1');
  await shot(page, '22-flow-editor-errors');
  await page.getByRole('button', { name: /dead end/ }).click(); // jumps to the node
  await expect(card.getByRole('textbox', { name: 'Question', exact: true })).toBeFocused();

  // fix it: two answers
  await card.getByRole('button', { name: /Add answer/ }).click();
  await card.getByLabel('Answer 1 label').fill('Yes');
  await card.getByLabel('Answer 1 goes to').selectOption('r1');
  await card.getByRole('button', { name: /Add answer/ }).click();
  await card.getByLabel('Answer 2 label').fill('No');
  await card.getByLabel('Answer 2 goes to').selectOption('r2');
  await expect(page.getByRole('tab', { name: /Checks.*No problems/ })).toBeVisible();
  await page.getByRole('tab', { name: 'Outline' }).click();
  await expect(page.getByRole('list', { name: 'Flow outline' })).toContainText('Is the printer powered on?');
  await shot(page, '23-flow-editor-outline');

  // live test run of the unsaved draft
  await page.getByRole('tab', { name: 'Test run' }).click();
  const panel = page.getByRole('tabpanel');
  await panel.getByRole('button', { name: /The first symptom/ }).click();
  await expect(panel.getByRole('heading', { name: 'Is the printer powered on?' })).toBeVisible();
  await shot(page, '24-flow-editor-test-run');

  await saved(page);
  await page.getByRole('button', { name: /^Publish/ }).click();
  await expect(page.getByRole('status').filter({ hasText: /Published/ })).toBeVisible();

  // a viewer finds it and runs it
  await loginAs(page, 'viewer@demo.test');
  await page.goto('/flows');
  await page.getByRole('link', { name: title }).click();
  await heading(page, 'What are you seeing?');
  await page.getByRole('button', { name: /The first symptom/ }).click();
  await heading(page, 'Is the printer powered on?');
  await page.getByRole('button', { name: /^2.*No/ }).click();
  await expect(page.getByTestId('flow-result')).toContainText('Describe who to contact');
  // global search returns the flow in its own group
  await page.goto('/');
  await page.getByRole('button', { name: /Find a procedure/ }).click();
  await page.getByRole('combobox', { name: 'Search' }).fill('printer powered');
  await expect(page.getByRole('group', { name: 'Flows' })).toContainText(title);
});

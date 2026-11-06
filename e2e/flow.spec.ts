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
  await heading(page, 'Does the Member ID on the invoice exist in Globo?');
  await shot(page, '18-flow-question');

  await page.getByRole('button', { name: /Yes/ }).click();
  await heading(page, 'Is the invoice on the Missing Claim page in web.transformer?');
  await page.getByRole('button', { name: /^2. No/ }).click();
  await heading(page, 'Is the invoice on the Missing GOP page in web.transformer?');
  await page.keyboard.press('2'); // keyboard: second answer
  await heading(page, 'Is the invoice on the Manual Handling page?');
  await shot(page, '19-flow-trail');
  await page.getByRole('button', { name: /^1. Yes/ }).click(); // Manual Handling -> article step with an inline preview
  await expect(page.getByRole('link', { name: /Open full article/ })).toHaveAttribute('href', '/article/web-transformer-manual-handling');
  await shot(page, '21-flow-article');

  await page.keyboard.press('Backspace');
  await heading(page, 'Is the invoice on the Manual Handling page?');

  await page.getByRole('button', { name: 'Start over' }).first().click();
  await heading(page, 'Does the Member ID on the invoice exist in Globo?');
  await page.keyboard.press('2');
  await heading(page, 'The invoice was automatically denied.');
  await expect(page.getByTestId('flow-result')).toHaveAttribute('data-severity', 'warning');
  await shot(page, '20-flow-result');

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

test('editor builds a flow, fixes a validation error, publishes; a viewer runs it', async ({ page, playwright, baseURL }) => {
  await loginAs(page, 'editor@demo.test');
  await page.goto('/flows/new/edit'); // advanced editor ("New flow" opens the guided builder, tested below)
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

  // while it is a draft a viewer gets 404 by id and it is not listed
  const flowId = page.url().match(/flows\/([0-9a-f-]{36})\/edit/)![1]!;
  const viewer = await playwright.request.newContext({ baseURL });
  expect((await viewer.post('/api/auth/dev/login', { data: { email: 'viewer@demo.test' } })).ok()).toBeTruthy();
  expect((await viewer.get(`/api/flows/${flowId}`)).status()).toBe(404);
  expect(JSON.stringify(await (await viewer.get('/api/flows')).json())).not.toContain(title);
  await viewer.dispose();

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
  await page.getByRole('button', { name: /Open search/ }).click(); // the top bar search (the home page has no search bar of its own)
  await page.getByRole('combobox', { name: 'Search' }).fill('printer powered');
  await expect(page.getByRole('group', { name: 'Flows' })).toContainText(title);
});

test('guided builder: a new editor builds and publishes a flow one question at a time; a viewer runs it', async ({ page, playwright, baseURL }) => {
  await loginAs(page, 'editor@demo.test');
  await page.goto('/flows');
  await page.getByRole('link', { name: 'New flow' }).click();
  const title = `E2E guided flow ${Date.now()}`;
  await page.getByLabel('Flow title').fill(title);
  await page.getByRole('button', { name: /Start building/ }).click();
  await expect(page).toHaveURL(/\/flows\/[0-9a-f-]{36}\/build$/);

  await page.getByLabel('Question').fill('Is the printer switched on?');
  await page.getByRole('button', { name: /Next/ }).click();
  await page.getByRole('button', { name: /Next/ }).click(); // Yes / No
  await page.getByRole('button', { name: /Give the solution/ }).click();
  await page.getByLabel('Solution').fill('Print a test page');
  await page.getByRole('button', { name: /Save ending/ }).click();
  await page.getByRole('button', { name: /Give the solution/ }).click();
  await page.getByLabel('Solution').fill('Switch it on and try again');
  await page.getByRole('button', { name: /Save ending/ }).click();
  await expect(page.getByRole('heading', { name: /Every path ends with an answer/ })).toBeVisible();
  await shot(page, '29-guided-builder-done');
  await page.getByRole('button', { name: /Publish/ }).click();
  await expect(page.getByText('Published! Everyone can use it now.')).toBeVisible();

  const viewer = await playwright.request.newContext({ baseURL });
  expect((await viewer.post('/api/auth/dev/login', { data: { email: 'viewer@demo.test' } })).ok()).toBeTruthy();
  const flowId = page.url().match(/flows\/([0-9a-f-]{36})\/build/)![1]!;
  const got = await (await viewer.get(`/api/flows/${flowId}`)).json();
  expect(got.status).toBe('published');
  expect(got.nodes.map((n: { text: string }) => n.text)).toEqual(['Is the printer switched on?', 'Print a test page', 'Switch it on and try again']);
});

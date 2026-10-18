import { expect, test } from '@playwright/test';

test('fixed confirmation saves by mouse, Enter, and Space from equivalent clean states', async ({ page, request }) => {
  await page.goto('/');
  await page.getByRole('radio', { name: 'Fixed confirmation' }).check();
  const startPromise = page.waitForResponse((response) => response.url().endsWith('/api/runs') && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Start Accessibility Test' }).click();
  const start = await startPromise;
  const { runId } = (await start.json()) as { runId: string };
  await expect(page.locator('.result-bar')).toContainText('Passed', { timeout: 60_000 });
  await expect(page.locator('.assertion-list')).toContainText('2026-10-20');
  await expect(page.locator('.attempt-row strong')).toHaveText(['2026-10-20', '2026-10-20']);
  await expect(page.locator('.attempt-row .state-pass')).toHaveCount(2);
  const result = await (await request.get(`/api/runs/${encodeURIComponent(runId)}`)).json();
  expect(result.result.mouse.initialDate).toBe('2026-10-10');
  expect(result.result.keyboard.map((attempt: { initialDate: string }) => attempt.initialDate)).toEqual(['2026-10-10', '2026-10-10']);
});

test('direct date-entry keyboard route completes the same task from an equivalent clean state', async ({ page, request }) => {
  await page.goto('/');
  await page.getByRole('radio', { name: 'Direct date-entry route' }).check();
  const startPromise = page.waitForResponse((response) => response.url().endsWith('/api/runs') && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Start Accessibility Test' }).click();
  const start = await startPromise;
  const { runId } = (await start.json()) as { runId: string };
  await expect(page.locator('.result-bar')).toContainText('Passed', { timeout: 60_000 });
  await expect(page.locator('.assertion-list')).toContainText('2026-10-20');
  await expect(page.locator('.attempt-row')).toContainText('Direct date entry');
  await expect(page.locator('.attempt-row')).toContainText('Field + Save focused naturally');
  await expect(page.locator('.attempt-row strong')).toHaveText('2026-10-20');
  await expect(page.locator('.attempt-row .state-pass')).toHaveCount(1);
  const result = await (await request.get(`/api/runs/${encodeURIComponent(runId)}`)).json();
  expect(result.result.mouse.initialDate).toBe('2026-10-10');
  expect(result.result.keyboard[0].initialDate).toBe('2026-10-10');
  await page.setViewportSize({ width: 320, height: 900 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
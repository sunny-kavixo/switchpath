import { expect, test } from '@playwright/test';

test('fixed confirmation saves by mouse, Enter, and Space', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('radio', { name: 'Fixed confirmation' }).check();
  await page.getByRole('button', { name: 'Start Accessibility Test' }).click();
  await expect(page.locator('.result-bar')).toContainText('Passed', { timeout: 60_000 });
  await expect(page.locator('.observed-state strong')).toHaveText('2026-10-20');
  await expect(page.locator('.attempt-row strong')).toHaveText(['2026-10-20', '2026-10-20']);
  await expect(page.locator('.attempt-row .state-pass')).toHaveCount(2);
});

test('direct date-entry keyboard route completes the same task without activating primary control', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('radio', { name: 'Direct date-entry route' }).check();
  await page.getByRole('button', { name: 'Start Accessibility Test' }).click();
  await expect(page.locator('.result-bar')).toContainText('Passed', { timeout: 60_000 });
  await expect(page.locator('.observed-state strong')).toHaveText('2026-10-20');
  await expect(page.locator('.attempt-row')).toContainText('Direct date entry');
  await expect(page.locator('.attempt-row')).toContainText('Focused field and save action');
  await expect(page.locator('.attempt-row strong')).toHaveText('2026-10-20');
  await expect(page.locator('.attempt-row .state-pass')).toHaveCount(1);
});
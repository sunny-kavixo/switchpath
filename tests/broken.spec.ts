import { expect, test } from '@playwright/test';

test('broken primary confirmation reproduces a mouse/keyboard task difference', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Start Accessibility Test' }).click();
  await expect(page.getByRole('status')).toContainText('Confirmed Failure', { timeout: 60_000 });
  await expect(page.getByText('✓ Expected date saved')).toBeVisible();
  await expect(page.getByText('Focused confirm')).toHaveCount(2);
  await expect(page.getByText('Not saved')).toHaveCount(2);
  await expect(page.getByText('2026-10-20')).toBeVisible();
  await expect(page.locator('.attempt-row strong')).toHaveText(['2026-10-10', '2026-10-10']);
});
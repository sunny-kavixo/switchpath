import { expect, test } from '@playwright/test';

test('dashboard supports keyboard selection, execution, navigation and narrow reflow', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'SwitchPath', exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Test workspace' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#test-workspace')).toBeInViewport();
  await page.goto('/');
  await page.reload();
  for (let index = 0; index < 4; index += 1) await page.keyboard.press('Tab');
  await expect(page.getByRole('radio', { name: 'Broken confirmation' })).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('radio', { name: 'Fixed confirmation' })).toBeChecked();
  await page.keyboard.press('Tab');
  const start = page.getByRole('button', { name: 'Start Accessibility Test' });
  await expect(start).toBeFocused();
  expect(await start.evaluate((element) => getComputedStyle(element).outlineStyle)).toBe('solid');
  await page.keyboard.press('Enter');
  await expect(page.locator('.result-bar')).toContainText('Passed', { timeout: 60_000 });
  await expect(page.getByRole('link', { name: 'Download mouse.png', exact: true })).toBeVisible();
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(start).toBeVisible();
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true);
});

test('unavailable API gives an accessible error and allows retry', async ({ page }) => {
  // Controlled UI error injection only; real worker failures are covered by backend tests.
  await page.route('**/api/runs', (route) => route.abort());
  await page.goto('/');
  await page.getByRole('button', { name: 'Start Accessibility Test' }).click();
  await expect(page.getByRole('status')).toContainText('Test Error');
  await expect(page.getByRole('status')).toContainText('This does not prove an accessibility defect.');
  await expect(page.getByRole('button', { name: 'Retry from clean state' })).toBeEnabled();
  await expect(page.getByRole('radio', { name: 'Fixed confirmation' })).toBeEnabled();
});

export function regressionTestSource(): string {
  return `import { expect, test } from '@playwright/test';
import {
  EXPECTED_BOOKING_DATE,
  INITIAL_BOOKING_DATE,
  isAllowedFixtureRequest,
  startBookingFixture,
  type BookingScenario,
} from '../../src/server/booking-fixture';

test('Confirm Reschedule saves the selected date by keyboard', async ({ browser }) => {
  const scenario = process.env.SWITCHPATH_REGRESSION_VARIANT as BookingScenario | undefined;
  if (scenario !== 'broken' && scenario !== 'fixed') throw new Error('Set SWITCHPATH_REGRESSION_VARIANT to broken or fixed');
  const fixture = await startBookingFixture(scenario);
  const context = await browser.newContext({ serviceWorkers: 'block' });
  await context.route('**/*', async (route) => {
    if (isAllowedFixtureRequest(route.request().url(), fixture.origin)) await route.continue();
    else await route.abort('blockedbyclient');
  });
  try {
    const page = await context.newPage();
    await page.goto(fixture.origin);
    await page.keyboard.press('Tab');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Tab');
    await expect(page.locator('#confirm')).toBeFocused();
    await page.keyboard.press('Enter');
    const deadline = Date.now() + 5000;
    while (fixture.readBookingDate() === INITIAL_BOOKING_DATE && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    expect(fixture.readBookingDate()).toBe(EXPECTED_BOOKING_DATE);
  } finally {
    await context.close();
    await fixture.close();
  }
});
`;
}
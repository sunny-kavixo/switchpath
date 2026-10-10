import { chromium, type Browser } from 'playwright';
import { startBookingFixture, EXPECTED_BOOKING_DATE, INITIAL_BOOKING_DATE, isAllowedFixtureRequest } from '../server/booking-fixture';

type BrokenRun = {
  scenarioId: 'broken';
};

type KeyboardAttempt = {
  key: 'Enter' | 'Space';
  focusedConfirm: boolean;
  initialDate: string;
  observedDate: string;
  unchanged: boolean;
};

async function openRestrictedPage(browser: Browser, origin: string) {
  const context = await browser.newContext({ serviceWorkers: 'block' });
  await context.route('**/*', async (route) => {
    if (isAllowedFixtureRequest(route.request().url(), origin)) await route.continue();
    else await route.abort('blockedbyclient');
  });
  const page = await context.newPage();
  page.setDefaultNavigationTimeout(5_000);
  await page.goto(origin);
  return { context, page };
}

async function runMouse(browser: Browser) {
  const fixture = await startBookingFixture();
  const { context, page } = await openRestrictedPage(browser, fixture.origin);
  try {
    await page.getByRole('button', { name: `Select new date ${EXPECTED_BOOKING_DATE}` }).click();
    await page.getByRole('button', { name: 'Confirm Reschedule' }).click();
    const deadline = Date.now() + 5_000;
    while (fixture.readBookingDate() !== EXPECTED_BOOKING_DATE && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    const observedDate = fixture.readBookingDate();
    return { expectedDate: EXPECTED_BOOKING_DATE, observedDate, verified: observedDate === EXPECTED_BOOKING_DATE };
  } finally {
    await context.close();
    await fixture.close();
  }
}

async function runKeyboardAttempt(browser: Browser, key: 'Enter' | 'Space'): Promise<KeyboardAttempt> {
  const fixture = await startBookingFixture();
  const { context, page } = await openRestrictedPage(browser, fixture.origin);
  try {
    await page.keyboard.press('Tab');
    const focusedDate = await page.locator('#date-choice').evaluate((element) => document.activeElement === element);
    if (!focusedDate) throw new Error('Keyboard did not naturally focus the date control');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Tab');
    const focusedConfirm = await page.locator('#confirm').evaluate((element) => document.activeElement === element);
    if (!focusedConfirm) throw new Error('Keyboard did not naturally focus Confirm Reschedule');
    await page.keyboard.press(key);
    await new Promise((resolve) => setTimeout(resolve, 150));
    const observedDate = fixture.readBookingDate();
    return { key, focusedConfirm, initialDate: INITIAL_BOOKING_DATE, observedDate, unchanged: observedDate === INITIAL_BOOKING_DATE };
  } finally {
    await context.close();
    await fixture.close();
  }
}

async function runBrokenScenario() {
  const browser = await chromium.launch({ headless: true, chromiumSandbox: true });
  try {
    const mouse = await runMouse(browser);
    const keyboard = await Promise.all([
      runKeyboardAttempt(browser, 'Enter'),
      runKeyboardAttempt(browser, 'Space'),
    ]);
    const confirmed = mouse.verified && keyboard.every((attempt) => attempt.focusedConfirm && attempt.unchanged);
    return {
      scenarioId: 'broken' as const,
      status: confirmed ? 'confirmed_failure' as const : 'inconclusive' as const,
      mouse,
      keyboard,
    };
  } finally {
    await browser.close();
  }
}

process.on('message', async (message: BrokenRun) => {
  try {
    if (message.scenarioId !== 'broken') throw new Error('Scenario is not available in this build slice');
    const result = await runBrokenScenario();
    process.send?.({ type: 'result', result });
  } catch (error) {
    process.send?.({
      type: 'error',
      reason: error instanceof Error ? error.message : 'Browser worker failed',
    });
  } finally {
    process.disconnect?.();
  }
});
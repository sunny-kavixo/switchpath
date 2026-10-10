import { chromium, type Browser } from 'playwright';
import { randomUUID } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { relative, resolve } from 'node:path';
import {
  startBookingFixture,
  EXPECTED_BOOKING_DATE,
  INITIAL_BOOKING_DATE,
  isAllowedFixtureRequest,
  type BookingScenario,
} from '../server/booking-fixture';
import { regressionTestSource } from './regression-template';

type RunRequest = { scenarioId: BookingScenario; runId: string };

type KeyboardAttempt = {
  key: 'Enter' | 'Space' | 'Direct date entry';
  focusedConfirm: boolean;
  focusedDateField?: boolean;
  focusedSaveAction?: boolean;
  initialDate: string;
  observedDate: string;
  unchanged: boolean;
  completed: boolean;
};

type RunResult = {
  scenarioId: BookingScenario;
  status: 'passed' | 'confirmed_failure' | 'inconclusive';
  mouse: { expectedDate: string; observedDate: string; verified: boolean };
  keyboard: KeyboardAttempt[];
  regressionReplay?: {
    brokenExitCode: number | null;
    fixedExitCode: number | null;
    brokenFailsAsExpected: boolean;
    fixedPasses: boolean;
  };
  regressionTestSource?: string;
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

async function waitForBookingDate(readDate: () => string, expectedDate: string): Promise<string> {
  const deadline = Date.now() + 5_000;
  while (readDate() !== expectedDate && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  return readDate();
}

async function runMouse(browser: Browser, scenario: BookingScenario) {
  const fixture = await startBookingFixture(scenario);
  const { context, page } = await openRestrictedPage(browser, fixture.origin);
  try {
    await page.getByRole('button', { name: `Select new date ${EXPECTED_BOOKING_DATE}` }).click();
    await page.getByRole('button', { name: 'Confirm Reschedule' }).click();
    const observedDate = await waitForBookingDate(fixture.readBookingDate, EXPECTED_BOOKING_DATE);
    return { expectedDate: EXPECTED_BOOKING_DATE, observedDate, verified: observedDate === EXPECTED_BOOKING_DATE };
  } finally {
    await context.close();
    await fixture.close();
  }
}

async function runKeyboardAttempt(browser: Browser, scenario: 'broken' | 'fixed', key: 'Enter' | 'Space'): Promise<KeyboardAttempt> {
  const fixture = await startBookingFixture(scenario);
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
    const observedDate = scenario === 'fixed'
      ? await waitForBookingDate(fixture.readBookingDate, EXPECTED_BOOKING_DATE)
      : (await new Promise((resolve) => setTimeout(() => resolve(fixture.readBookingDate()), 150))) as string;
    return {
      key,
      focusedConfirm,
      initialDate: INITIAL_BOOKING_DATE,
      observedDate,
      unchanged: observedDate === INITIAL_BOOKING_DATE,
      completed: observedDate === EXPECTED_BOOKING_DATE,
    };
  } finally {
    await context.close();
    await fixture.close();
  }
}

async function runAlternativeRoute(browser: Browser): Promise<KeyboardAttempt> {
  const fixture = await startBookingFixture('alternative');
  const { context, page } = await openRestrictedPage(browser, fixture.origin);
  try {
    await page.keyboard.press('Tab');
    const focusedDateChoice = await page.locator('#date-choice').evaluate((element) => document.activeElement === element);
    await page.keyboard.press('Tab');
    const focusedDateField = await page.getByRole('textbox', { name: 'Enter new date' }).evaluate((element) => document.activeElement === element);
    if (!focusedDateChoice || !focusedDateField) {
      return {
        key: 'Direct date entry', focusedConfirm: false, focusedDateField: false, focusedSaveAction: false,
        initialDate: INITIAL_BOOKING_DATE, observedDate: fixture.readBookingDate(), unchanged: true, completed: false,
      };
    }
    await page.keyboard.type(EXPECTED_BOOKING_DATE);
    await page.keyboard.press('Tab');
    const focusedSaveAction = await page.getByRole('button', { name: 'Save new date' }).evaluate((element) => document.activeElement === element);
    if (focusedSaveAction) await page.keyboard.press('Enter');
    const observedDate = focusedSaveAction
      ? await waitForBookingDate(fixture.readBookingDate, EXPECTED_BOOKING_DATE)
      : fixture.readBookingDate();
    return {
      key: 'Direct date entry', focusedConfirm: false, focusedDateField, focusedSaveAction,
      initialDate: INITIAL_BOOKING_DATE, observedDate,
      unchanged: observedDate === INITIAL_BOOKING_DATE, completed: observedDate === EXPECTED_BOOKING_DATE,
    };
  } finally {
    await context.close();
    await fixture.close();
  }
}

function runRegressionVariant(testPath: string, scenarioId: 'broken' | 'fixed'): Promise<{ exitCode: number | null; timedOut: boolean }> {
  const outputDirectory = resolve(tmpdir(), `switchpath-replay-${randomUUID()}`);
  return mkdir(outputDirectory, { recursive: true }).then(() => new Promise((resolveResult) => {
    const cliPath = resolve(process.cwd(), 'node_modules', '@playwright', 'test', 'cli.js');
    const child = spawn(process.execPath, [cliPath, 'test', relative(process.cwd(), testPath), '--config=playwright.config.ts', '--reporter=list', '--workers=1', `--output=${outputDirectory}`], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        SWITCHPATH_REGRESSION_MODE: '1',
        SWITCHPATH_REGRESSION_VARIANT: scenarioId,
      },
      stdio: ['ignore', 'ignore', 'ignore'],
    });
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
    }, 50_000);
    child.once('error', () => {
      clearTimeout(timeout);
      void rm(outputDirectory, { recursive: true, force: true }).finally(() => resolveResult({ exitCode: null, timedOut }));
    });
    child.once('close', (code) => {
      clearTimeout(timeout);
      void rm(outputDirectory, { recursive: true, force: true }).finally(() => resolveResult({ exitCode: code, timedOut }));
    });
  }));
}

async function verifyRegressionReplay(runId: string) {
  const source = regressionTestSource();
  const generatedDirectory = resolve(process.cwd(), 'tests', 'generated');
  await mkdir(generatedDirectory, { recursive: true });
  const testPath = resolve(generatedDirectory, `switchpath-${runId}.spec.ts`);
  await writeFile(testPath, source, { encoding: 'utf8', mode: 0o600 });
  const broken = await runRegressionVariant(testPath, 'broken');
  const fixed = await runRegressionVariant(testPath, 'fixed');
  return {
    source,
    replay: {
      brokenExitCode: broken.exitCode,
      fixedExitCode: fixed.exitCode,
      brokenFailsAsExpected: broken.exitCode === 1 && !broken.timedOut,
      fixedPasses: fixed.exitCode === 0 && !fixed.timedOut,
    },
  };
}

async function runScenario(scenarioId: BookingScenario, runId: string): Promise<RunResult> {
  const browser = await chromium.launch({ headless: true, chromiumSandbox: true });
  try {
    const mouse = await runMouse(browser, scenarioId);
    const keyboard = scenarioId === 'alternative'
      ? [await runAlternativeRoute(browser)]
      : await Promise.all([
        runKeyboardAttempt(browser, scenarioId, 'Enter'),
        runKeyboardAttempt(browser, scenarioId, 'Space'),
      ]);
    const journeysComplete = scenarioId === 'alternative'
      ? keyboard[0].focusedDateField === true && keyboard[0].focusedSaveAction === true && keyboard[0].completed
      : keyboard.every((attempt) => attempt.focusedConfirm && (scenarioId === 'fixed' ? attempt.completed : attempt.unchanged));
    const directValid = mouse.verified && journeysComplete;
    if (scenarioId === 'broken') {
      const base = { scenarioId, mouse, keyboard };
      if (!directValid) return { ...base, status: 'inconclusive' };
      await browser.close();
      const { source, replay } = await verifyRegressionReplay(runId);
      return {
        ...base,
        status: replay.brokenFailsAsExpected && replay.fixedPasses ? 'confirmed_failure' : 'inconclusive',
        regressionReplay: replay,
        regressionTestSource: source,
      };
    }
    return { scenarioId, status: directValid ? 'passed' : 'inconclusive', mouse, keyboard };
  } finally {
    if (browser.isConnected()) await browser.close();
  }
}

process.on('message', async (message: RunRequest) => {
  try {
    if (!['broken', 'fixed', 'alternative'].includes(message.scenarioId)) throw new Error('Unknown scenario');
    const result = await runScenario(message.scenarioId, message.runId);
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
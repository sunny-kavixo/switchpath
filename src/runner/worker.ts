import { chromium, type Browser } from 'playwright';
import { randomUUID } from 'node:crypto';
import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import {
  startBookingFixture,
  EXPECTED_BOOKING_DATE,
  INITIAL_BOOKING_DATE,
  isAllowedFixtureRequest,
  type BookingScenario,
} from '../server/booking-fixture';
import { regressionTestSource } from './regression-template';

type RunRequest = { scenarioId: BookingScenario; runId: string; artifactDirectory: string };
type ArtifactInfo = { id: string; contentType: string; size: number };

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
  mouse: { initialDate: string; expectedDate: string; observedDate: string; verified: boolean };
  keyboard: KeyboardAttempt[];
  regressionReplay?: {
    brokenExitCode: number | null;
    fixedExitCode: number | null;
    brokenFailsAsExpected: boolean;
    fixedPasses: boolean;
  };
  regressionTestSource?: string;
  artifacts: ArtifactInfo[];
};

type ProgressStage = 'browser_start' | 'mouse_run' | 'keyboard_run' | 'oracle_check' | 'regression_replay' | 'complete';

let sendProgress: (stage: ProgressStage, message: string) => void = () => undefined;
let activeBrowser: Browser | undefined;
let activeReplayProcess: ReturnType<typeof spawn> | undefined;

async function openRestrictedPage(browser: Browser, origin: string) {
  const context = await browser.newContext({ serviceWorkers: 'block' });
  await context.tracing.start({ screenshots: true, snapshots: true, sources: false });
  await context.route('**/*', async (route) => {
    if (isAllowedFixtureRequest(route.request().url(), origin)) await route.continue();
    else await route.abort('blockedbyclient');
  });
  const page = await context.newPage();
  const browserLogs: string[] = [];
  page.on('console', (message) => {
    if (browserLogs.length < 100) browserLogs.push(`${message.type()}: ${sanitizeLog(message.text()).slice(0, 500)}`);
  });
  page.on('pageerror', (error) => {
    if (browserLogs.length < 100) browserLogs.push(`pageerror: ${sanitizeLog(error.message).slice(0, 500)}`);
  });
  page.setDefaultNavigationTimeout(5_000);
  try {
    await page.goto(origin);
  } catch (error) {
    await context.close();
    if (error instanceof Error && error.name === 'TimeoutError') throw new Error('Navigation timeout while opening the controlled booking fixture.');
    throw new Error('Navigation error while opening the controlled booking fixture.');
  }
  return { context, page, browserLogs };
}

function sanitizeLog(value: string): string {
  return value
    .replace(/(api[_-]?key|token|secret)\s*[:=]\s*[^\s,;]+/gi, '$1=[REDACTED]')
    .replace(/(?:nvapi-|sk-|gh[pousr]_)[A-Za-z0-9_-]{12,}/g, '[REDACTED]');
}

async function captureJourney(context: Awaited<ReturnType<typeof openRestrictedPage>>['context'], page: Awaited<ReturnType<typeof openRestrictedPage>>['page'], browserLogs: string[], artifactDirectory: string, prefix: string): Promise<ArtifactInfo[]> {
  const entries: ArtifactInfo[] = [];
  const screenshotId = `${prefix}.png`;
  const screenshotPath = join(artifactDirectory, screenshotId);
  await page.screenshot({ path: screenshotPath, fullPage: true });
  entries.push({ id: screenshotId, contentType: 'image/png', size: (await stat(screenshotPath)).size });

  const traceId = `${prefix}.trace.zip`;
  const tracePath = join(artifactDirectory, traceId);
  await context.tracing.stop({ path: tracePath });
  entries.push({ id: traceId, contentType: 'application/zip', size: (await stat(tracePath)).size });

  const logId = `${prefix}.log.json`;
  const logPath = join(artifactDirectory, logId);
  await writeFile(logPath, JSON.stringify({ entries: browserLogs }, null, 2), { encoding: 'utf8', mode: 0o600 });
  entries.push({ id: logId, contentType: 'application/json', size: (await stat(logPath)).size });
  return entries;
}

async function waitForBookingDate(readDate: () => string, expectedDate: string): Promise<string> {
  const deadline = Date.now() + 5_000;
  while (readDate() !== expectedDate && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  return readDate();
}

async function runMouse(browser: Browser, scenario: BookingScenario, artifactDirectory: string) {
  const fixture = await startBookingFixture(scenario);
  let opened: Awaited<ReturnType<typeof openRestrictedPage>> | undefined;
  try {
    opened = await openRestrictedPage(browser, fixture.origin);
    const { context, page, browserLogs } = opened;
    sendProgress('mouse_run', 'Running the mouse baseline in a fresh booking state.');
    await page.getByRole('button', { name: `Select new date ${EXPECTED_BOOKING_DATE}` }).click();
    await page.getByRole('button', { name: 'Confirm Reschedule' }).click();
    const observedDate = await waitForBookingDate(fixture.readBookingDate, EXPECTED_BOOKING_DATE);
    const artifacts = await captureJourney(context, page, browserLogs, artifactDirectory, 'mouse');
    sendProgress('oracle_check', 'Read the mouse fixture booking state independently.');
    return { journey: { initialDate: INITIAL_BOOKING_DATE, expectedDate: EXPECTED_BOOKING_DATE, observedDate, verified: observedDate === EXPECTED_BOOKING_DATE }, artifacts };
  } finally {
    await opened?.context.close();
    await fixture.close();
  }
}

async function runKeyboardAttempt(browser: Browser, scenario: 'broken' | 'fixed', key: 'Enter' | 'Space', artifactDirectory: string): Promise<{ attempt: KeyboardAttempt; artifacts: ArtifactInfo[] }> {
  const fixture = await startBookingFixture(scenario);
  let opened: Awaited<ReturnType<typeof openRestrictedPage>> | undefined;
  try {
    opened = await openRestrictedPage(browser, fixture.origin);
    const { context, page, browserLogs } = opened;
    sendProgress('keyboard_run', `Running the ${key} keyboard activation from a separate fresh booking state.`);
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
    const artifacts = await captureJourney(context, page, browserLogs, artifactDirectory, `keyboard-${key.toLowerCase()}`);
    return {
      attempt: {
        key,
        focusedConfirm,
        initialDate: INITIAL_BOOKING_DATE,
        observedDate,
        unchanged: observedDate === INITIAL_BOOKING_DATE,
        completed: observedDate === EXPECTED_BOOKING_DATE,
      },
      artifacts,
    };
  } finally {
    await opened?.context.close();
    await fixture.close();
  }
}

async function runAlternativeRoute(browser: Browser, artifactDirectory: string): Promise<{ attempt: KeyboardAttempt; artifacts: ArtifactInfo[] }> {
  const fixture = await startBookingFixture('alternative');
  let opened: Awaited<ReturnType<typeof openRestrictedPage>> | undefined;
  try {
    opened = await openRestrictedPage(browser, fixture.origin);
    const { context, page, browserLogs } = opened;
    sendProgress('keyboard_run', 'Running direct date entry using Tab, typed keys, and Enter from a fresh booking state.');
    await page.keyboard.press('Tab');
    const focusedDateChoice = await page.locator('#date-choice').evaluate((element) => document.activeElement === element);
    await page.keyboard.press('Tab');
    const focusedDateField = await page.getByRole('textbox', { name: 'Enter new date' }).evaluate((element) => document.activeElement === element);
    if (!focusedDateChoice || !focusedDateField) {
      return {
        attempt: {
          key: 'Direct date entry', focusedConfirm: false, focusedDateField: false, focusedSaveAction: false,
          initialDate: INITIAL_BOOKING_DATE, observedDate: fixture.readBookingDate(), unchanged: true, completed: false,
        },
        artifacts: await captureJourney(context, page, browserLogs, artifactDirectory, 'keyboard-alternative'),
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
      attempt: {
        key: 'Direct date entry', focusedConfirm: false, focusedDateField, focusedSaveAction,
        initialDate: INITIAL_BOOKING_DATE, observedDate,
        unchanged: observedDate === INITIAL_BOOKING_DATE, completed: observedDate === EXPECTED_BOOKING_DATE,
      },
      artifacts: await captureJourney(context, page, browserLogs, artifactDirectory, 'keyboard-alternative'),
    };
  } finally {
    await opened?.context.close();
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
      detached: process.platform !== 'win32',
      stdio: ['ignore', 'ignore', 'ignore'],
    });
    activeReplayProcess = child;
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      if (child.pid && process.platform !== 'win32') {
        try { process.kill(-child.pid, 'SIGTERM'); } catch { child.kill('SIGTERM'); }
      } else child.kill('SIGTERM');
    }, 50_000);
    child.once('error', () => {
      if (activeReplayProcess === child) activeReplayProcess = undefined;
      clearTimeout(timeout);
      void rm(outputDirectory, { recursive: true, force: true }).finally(() => resolveResult({ exitCode: null, timedOut }));
    });
    child.once('close', (code) => {
      if (activeReplayProcess === child) activeReplayProcess = undefined;
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
  try {
    sendProgress('regression_replay', 'Replaying the generated standalone test against broken and fixed fixtures.');
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
  } finally {
    await rm(testPath, { force: true });
  }
}

async function runScenario(scenarioId: BookingScenario, runId: string, artifactDirectory: string): Promise<RunResult> {
  sendProgress('browser_start', 'Starting sandboxed Chromium for an actual browser run.');
  let browser: Browser;
  try {
    browser = await chromium.launch({ headless: true, chromiumSandbox: true });
  } catch {
    throw Object.assign(new Error('Browser startup failure: sandboxed Chromium could not start.'), { category: 'browser_startup' as const });
  }
  activeBrowser = browser;
  try {
    const mouseRun = await runMouse(browser, scenarioId, artifactDirectory);
    const mouse = mouseRun.journey;
    const artifacts = [...mouseRun.artifacts];
    const keyboardRuns = scenarioId === 'alternative'
      ? [await runAlternativeRoute(browser, artifactDirectory)]
      : await Promise.all([
        runKeyboardAttempt(browser, scenarioId, 'Enter', artifactDirectory),
        runKeyboardAttempt(browser, scenarioId, 'Space', artifactDirectory),
      ]);
    const keyboard = keyboardRuns.map((result) => result.attempt);
    for (const result of keyboardRuns) artifacts.push(...result.artifacts);
    const journeysComplete = scenarioId === 'alternative'
      ? keyboard[0].focusedDateField === true && keyboard[0].focusedSaveAction === true && keyboard[0].completed
      : keyboard.every((attempt) => attempt.focusedConfirm && (scenarioId === 'fixed' ? attempt.completed : attempt.unchanged));
    const directValid = mouse.verified && journeysComplete;
    if (scenarioId === 'broken') {
      const base = { scenarioId, mouse, keyboard };
      if (!directValid) return { ...base, artifacts, status: 'inconclusive' };
      await browser.close();
      activeBrowser = undefined;
      const { source, replay } = await verifyRegressionReplay(runId);
      const regressionTestPath = join(artifactDirectory, 'regression-test.spec.ts');
      await writeFile(regressionTestPath, source, { encoding: 'utf8', mode: 0o600 });
      artifacts.push({ id: 'regression-test.spec.ts', contentType: 'text/plain; charset=utf-8', size: Buffer.byteLength(source) });
      sendProgress('complete', 'The real browser runs and independent booking assertions are complete.');
      return {
        ...base,
        artifacts,
        status: replay.brokenFailsAsExpected && replay.fixedPasses ? 'confirmed_failure' : 'inconclusive',
        regressionReplay: replay,
        regressionTestSource: source,
      };
    }
    sendProgress('complete', 'The real browser runs and independent booking assertion are complete.');
    return { scenarioId, status: directValid ? 'passed' : 'inconclusive', mouse, keyboard, artifacts };
  } finally {
    if (browser.isConnected()) await browser.close();
    if (activeBrowser === browser) activeBrowser = undefined;
  }
}

process.on('message', async (message: RunRequest) => {
  try {
    if (!['broken', 'fixed', 'alternative'].includes(message.scenarioId)) throw new Error('Unknown scenario');
    sendProgress = (stage, text) => process.send?.({
      type: 'progress',
      event: { stage, message: text, timestamp: new Date().toISOString() },
    });
    const result = await runScenario(message.scenarioId, message.runId, message.artifactDirectory);
    process.send?.({ type: 'result', result });
  } catch (error) {
    const reason = error instanceof Error && error.message.startsWith('Navigation timeout')
      ? 'Navigation timeout while opening the controlled booking fixture.'
      : error instanceof Error && error.message.startsWith('Browser startup failure')
        ? 'Browser startup failure: sandboxed Chromium could not start.'
        : 'Playwright execution error in the controlled scenario.';
    process.send?.({
      type: 'error',
      category: error instanceof Error && 'category' in error && error.category === 'browser_startup'
        ? 'browser_startup'
        : error instanceof Error && error.message.startsWith('Navigation timeout')
          ? 'navigation_timeout'
          : 'execution_error',
      reason,
    });
  } finally {
    process.disconnect?.();
  }
});

process.on('SIGTERM', () => {
  void (async () => {
    if (activeReplayProcess?.pid && process.platform !== 'win32') {
      try { process.kill(-activeReplayProcess.pid, 'SIGTERM'); } catch { activeReplayProcess.kill('SIGTERM'); }
    } else activeReplayProcess?.kill('SIGTERM');
    await activeBrowser?.close().catch(() => undefined);
    process.exit(1);
  })();
});
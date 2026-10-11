import { expect, test } from '@playwright/test';

test('broken comparison exposes authentic evidence and supports a clean retry', async ({ page, request }) => {
  await page.goto('/');
  await expect(page.getByRole('radio')).toHaveCount(3);
  const startResponsePromise = page.waitForResponse((response) => response.url().endsWith('/api/runs') && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Start Accessibility Test' }).click();
  const startResponse = await startResponsePromise;
  expect(startResponse.status()).toBe(202);
  const { runId } = (await startResponse.json()) as { runId: string };
  await expect(page.locator('.result-bar')).toContainText('Confirmed Failure', { timeout: 60_000 });
  await expect(page.locator('.assertion-list')).toContainText('Verified saved');
  await expect(page.getByText('Confirm focused naturally')).toHaveCount(2);
  await expect(page.getByText('Unchanged')).toHaveCount(2);
  await expect(page.locator('.task-facts')).toContainText('2026-10-20');
  await expect(page.locator('.attempt-row strong')).toHaveText(['2026-10-10', '2026-10-10']);
  await expect(page.getByText('Standalone regression replay: broken fails as expected; fixed passes.')).toBeVisible();

  const statusResponse = await request.get(`/api/runs/${encodeURIComponent(runId)}`);
  expect(statusResponse.ok()).toBeTruthy();
  const status = await statusResponse.json();
  expect(status.executionState).toBe('completed');
  expect(status.result.mouse).toEqual({ initialDate: '2026-10-10', expectedDate: '2026-10-20', observedDate: '2026-10-20', verified: true });
  expect(status.result.keyboard.map((attempt: { initialDate: string; observedDate: string }) => [attempt.initialDate, attempt.observedDate])).toEqual([
    ['2026-10-10', '2026-10-10'],
    ['2026-10-10', '2026-10-10'],
  ]);
  expect(status.result.regressionReplay).toMatchObject({ brokenFailsAsExpected: true, fixedPasses: true });
  expect(status.result.mouse.initialDate).toBe('2026-10-10');
  const eventResponse = await request.get(`/api/runs/${encodeURIComponent(runId)}/events`);
  expect(eventResponse.status()).toBe(200);
  const eventStream = await eventResponse.text();
  expect(eventStream).toContain('event: progress');
  expect(eventStream).toContain('mouse_run');
  expect(eventStream).toContain('keyboard_run');
  expect(eventStream).toContain('event: complete');
  expect(status.artifacts.length).toBeGreaterThan(0);

  const reportResponse = await request.get(`/api/runs/${encodeURIComponent(runId)}/report`);
  expect(reportResponse.status()).toBe(200);
  const reportText = await reportResponse.text();
  expect(reportText).not.toContain('NVIDIA_API_KEY');
  expect(reportText).not.toContain('/tmp/switchpath-run-');
  const report = JSON.parse(reportText) as { status: string; mouseAssertion: { verified: boolean }; keyboardAssertions: Array<{ initialDate: string }>; artifacts: Array<{ id: string; size: number }> };
  expect(report.status).toBe('confirmed_failure');
  expect(report.mouseAssertion.verified).toBe(true);
  expect(report.keyboardAssertions.every((attempt) => attempt.initialDate === '2026-10-10')).toBe(true);

  for (const artifact of status.artifacts as Array<{ id: string; size: number }>) {
    const download = await request.get(`/api/runs/${encodeURIComponent(runId)}/artifacts/${encodeURIComponent(artifact.id)}`);
    expect(download.status()).toBe(200);
    expect((await download.body()).byteLength).toBe(artifact.size);
  }
  const regressionDownload = await request.get(`/api/runs/${encodeURIComponent(runId)}/regression-test`);
  expect(regressionDownload.status()).toBe(200);
  expect(await regressionDownload.text()).toContain('Confirm Reschedule saves the selected date by keyboard');
  expect((await request.get(`/api/runs/${encodeURIComponent(runId)}/artifacts/%2e%2e%2f..%2f.env`)).status()).toBe(404);

  const retryStartPromise = page.waitForResponse((response) => response.url().endsWith('/api/runs') && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Retry from clean state' }).click();
  const retryResponse = await retryStartPromise;
  expect(retryResponse.status()).toBe(202);
  const retry = (await retryResponse.json()) as { runId: string };
  expect(retry.runId).not.toBe(runId);
  const retryDeadline = Date.now() + 60_000;
  let retryStatus: { status: string } = { status: 'running' };
  while (retryStatus.status === 'running' && Date.now() < retryDeadline) {
    const response = await request.get(`/api/runs/${encodeURIComponent(retry.runId)}`);
    retryStatus = await response.json() as { status: string };
    if (retryStatus.status === 'running') await new Promise((resolve) => setTimeout(resolve, 250));
  }
  expect(retryStatus.status).toBe('confirmed_failure');
});
import assert from 'node:assert/strict';
import test from 'node:test';
import { createApp, safeWorkerEnvironment } from './app';
import { INITIAL_BOOKING_DATE, isAllowedFixtureRequest, startBookingFixture } from './booking-fixture';

test('run endpoint rejects unknown scenario identifiers before worker launch', async () => {
  const app = await createApp();
  const response = await app.inject({
    method: 'POST',
    url: '/api/runs',
    payload: { scenarioId: 'https://example.com' },
  });
  assert.equal(response.statusCode, 400);
  await app.close();
});

test('run endpoint rejects arbitrary fields before worker launch', async () => {
  const app = await createApp();
  const response = await app.inject({
    method: 'POST',
    url: '/api/runs',
    payload: { scenarioId: 'broken', url: 'http://127.0.0.1', command: 'whoami' },
  });
  assert.equal(response.statusCode, 400);
  await app.close();
});

test('unknown run IDs return not found', async () => {
  const app = await createApp();
  const response = await app.inject({ method: 'GET', url: `/api/runs/${'a'.repeat(36)}` });
  assert.equal(response.statusCode, 404);
  await app.close();
});

test('worker environment excludes hosted AI credentials and unrelated variables', () => {
  const original = process.env.NVIDIA_API_KEY;
  process.env.NVIDIA_API_KEY = 'test-only-sentinel';
  try {
    const environment = safeWorkerEnvironment();
    assert.equal(environment.NVIDIA_API_KEY, undefined);
    assert.deepEqual(Object.keys(environment).sort(), Object.keys(environment).filter((key) => [
      'PATH', 'HOME', 'TMPDIR', 'TEMP', 'TMP', 'PLAYWRIGHT_BROWSERS_PATH', 'XDG_CACHE_HOME',
    ].includes(key)).sort());
  } finally {
    if (original === undefined) delete process.env.NVIDIA_API_KEY;
    else process.env.NVIDIA_API_KEY = original;
  }
});

test('browser requests are restricted to the exact fixture origin', () => {
  const origin = 'http://127.0.0.1:43127';
  assert.equal(isAllowedFixtureRequest(`${origin}/`, origin), true);
  assert.equal(isAllowedFixtureRequest('http://127.0.0.1:43127.evil.test/', origin), false);
  assert.equal(isAllowedFixtureRequest('https://example.com/', origin), false);
  assert.equal(isAllowedFixtureRequest('not a URL', origin), false);
});

test('API exposes no arbitrary browser automation route', async () => {
  const app = await createApp();
  const response = await app.inject({ method: 'POST', url: '/api/browser/click', payload: { selector: '#confirm' } });
  assert.equal(response.statusCode, 404);
  await app.close();
});

test('booking fixture rejects impossible ISO dates without changing oracle state', async () => {
  const fixture = await startBookingFixture('alternative');
  try {
    const response = await fetch(`${fixture.origin}/__fixture/reschedule`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ date: '2026-02-30' }),
    });
    assert.equal(response.status, 400);
    assert.equal(fixture.readBookingDate(), INITIAL_BOOKING_DATE);
  } finally {
    await fixture.close();
  }
});

test('scenario starts are rate limited per client', async () => {
  const app = await createApp();
  try {
    const responses = [];
    for (let index = 0; index < 6; index += 1) {
      responses.push(await app.inject({ method: 'POST', url: '/api/runs', payload: { scenarioId: 'fixed' } }));
    }
    assert.equal(responses[0].statusCode, 202);
    assert.equal(responses.at(-1)?.statusCode, 429);
  } finally {
    await app.close();
  }
});

test('evidence endpoints do not reveal unknown run or artifact paths', async () => {
  const app = await createApp();
  const runId = 'd3ae1b78-d7f1-4a91-9ce9-5f3f602c9d18';
  try {
    assert.equal((await app.inject({ method: 'GET', url: `/api/runs/${runId}/report` })).statusCode, 404);
    assert.equal((await app.inject({ method: 'GET', url: `/api/runs/${runId}/artifacts/mouse.png` })).statusCode, 404);
    assert.equal((await app.inject({ method: 'GET', url: `/api/runs/${runId}/regression-test` })).statusCode, 404);
    assert.equal((await app.inject({ method: 'GET', url: `/api/runs/${runId}/events` })).statusCode, 404);
  } finally {
    await app.close();
  }
});

test('browser startup failure is incomplete test error, never an accessibility verdict', async () => {
  const original = process.env.PLAYWRIGHT_BROWSERS_PATH;
  process.env.PLAYWRIGHT_BROWSERS_PATH = '/tmp/switchpath-no-installed-browser';
  const app = await createApp();
  try {
    const start = await app.inject({ method: 'POST', url: '/api/runs', payload: { scenarioId: 'broken' } });
    assert.equal(start.statusCode, 202);
    const { runId } = start.json() as { runId: string };
    const deadline = Date.now() + 10_000;
    let result: { status: string; executionState: string; reason?: string } = { status: 'running', executionState: 'running' };
    while (result.status === 'running' && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      const response = await app.inject({ method: 'GET', url: `/api/runs/${runId}` });
      result = response.json();
    }
    assert.equal(result.status, 'test_error');
    assert.equal(result.executionState, 'incomplete');
    assert.match(result.reason ?? '', /Browser startup failure/);
    assert.notEqual(result.status, 'confirmed_failure');
  } finally {
    await app.close();
    if (original === undefined) delete process.env.PLAYWRIGHT_BROWSERS_PATH;
    else process.env.PLAYWRIGHT_BROWSERS_PATH = original;
  }
});

test('worker timeout is reported as incomplete Test Error and never Confirmed Failure', async () => {
  const app = await createApp({ workerTimeoutMs: 25 });
  try {
    const start = await app.inject({ method: 'POST', url: '/api/runs', payload: { scenarioId: 'broken' } });
    assert.equal(start.statusCode, 202);
    const { runId } = start.json() as { runId: string };
    const deadline = Date.now() + 5_000;
    let result: { status: string; executionState: string; reason?: string } = { status: 'running', executionState: 'running' };
    while (result.status === 'running' && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 20));
      result = (await app.inject({ method: 'GET', url: `/api/runs/${runId}` })).json();
    }
    assert.equal(result.status, 'test_error');
    assert.equal(result.executionState, 'incomplete');
    assert.match(result.reason ?? '', /Test Incomplete/);
    assert.notEqual(result.status, 'confirmed_failure');
  } finally {
    await app.close();
  }
});
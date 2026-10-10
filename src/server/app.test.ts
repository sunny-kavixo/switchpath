import assert from 'node:assert/strict';
import test from 'node:test';
import { createApp, safeWorkerEnvironment } from './app';
import { isAllowedFixtureRequest } from './booking-fixture';

test('run endpoint rejects unknown scenario identifiers before worker launch', async () => {
  const app = createApp();
  const response = await app.inject({
    method: 'POST',
    url: '/api/runs',
    payload: { scenarioId: 'https://example.com' },
  });
  assert.equal(response.statusCode, 400);
  await app.close();
});

test('run endpoint rejects arbitrary fields before worker launch', async () => {
  const app = createApp();
  const response = await app.inject({
    method: 'POST',
    url: '/api/runs',
    payload: { scenarioId: 'broken', url: 'http://127.0.0.1', command: 'whoami' },
  });
  assert.equal(response.statusCode, 400);
  await app.close();
});

test('recognized scenarios without an implemented slice do not return fake results', async () => {
  const app = createApp();
  const response = await app.inject({ method: 'POST', url: '/api/runs', payload: { scenarioId: 'fixed' } });
  assert.equal(response.statusCode, 501);
  assert.deepEqual(response.json(), { message: 'This scenario is not implemented yet.' });
  await app.close();
});

test('unknown run IDs return not found', async () => {
  const app = createApp();
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
  const app = createApp();
  const response = await app.inject({ method: 'POST', url: '/api/browser/click', payload: { selector: '#confirm' } });
  assert.equal(response.statusCode, 404);
  await app.close();
});
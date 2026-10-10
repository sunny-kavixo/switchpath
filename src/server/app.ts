import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance } from 'fastify';
import { fork, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { lstat, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

type ScenarioId = 'broken' | 'fixed' | 'alternative';
type RunResult = {
  scenarioId: ScenarioId;
  status: 'passed' | 'confirmed_failure' | 'inconclusive';
  mouse: { initialDate: string; expectedDate: string; observedDate: string; verified: boolean };
  keyboard: Array<{
    key: 'Enter' | 'Space' | 'Direct date entry';
    focusedConfirm: boolean;
    focusedDateField?: boolean;
    focusedSaveAction?: boolean;
    initialDate: string;
    observedDate: string;
    unchanged: boolean;
    completed: boolean;
  }>;
  regressionReplay?: {
    brokenExitCode: number | null;
    fixedExitCode: number | null;
    brokenFailsAsExpected: boolean;
    fixedPasses: boolean;
  };
  regressionTestSource?: string;
  artifacts: Array<{ id: string; contentType: string; size: number }>;
};
type RunEvent = { stage: string; message: string; timestamp: string };
type RunRecord = {
  status: 'running' | 'passed' | 'confirmed_failure' | 'inconclusive' | 'test_error';
  executionState: 'running' | 'completed' | 'incomplete';
  reason?: string;
  result?: Omit<RunResult, 'regressionTestSource'>;
  regressionTestSource?: string;
  artifacts: Array<{ id: string; contentType: string; size: number }>;
  events: RunEvent[];
  createdAt: number;
  artifactDirectory: string;
  timeout?: NodeJS.Timeout;
  handlingResult?: boolean;
};
type WorkerMessage =
  | { type: 'result'; result: RunResult }
  | { type: 'progress'; event: RunEvent }
  | { type: 'error'; category: 'browser_startup' | 'navigation_timeout' | 'execution_error'; reason: string };

const MAX_RUNS = 32;
const RUN_RETENTION_MS = 10 * 60 * 1000;
const MAX_ARTIFACT_BYTES = 10 * 1024 * 1024;
const MAX_ARTIFACT_COUNT = 16;
const artifactIdPattern = /^(mouse|keyboard-enter|keyboard-space|keyboard-alternative)(\.png|\.trace\.zip|\.log\.json)$|^regression-test\.spec\.ts$/;

const scenarioIds: ScenarioId[] = ['broken', 'fixed', 'alternative'];
const runBodySchema = {
  type: 'object',
  additionalProperties: false,
  properties: { scenarioId: { type: 'string', enum: scenarioIds } },
  required: ['scenarioId'],
} as const;
const runIdParamsSchema = {
  type: 'object',
  additionalProperties: false,
  properties: { runId: { type: 'string', minLength: 36, maxLength: 36 } },
  required: ['runId'],
} as const;
const artifactParamsSchema = {
  type: 'object', additionalProperties: false,
  properties: {
    runId: { type: 'string', minLength: 36, maxLength: 36 },
    artifactId: { type: 'string', maxLength: 80 },
  },
  required: ['runId', 'artifactId'],
} as const;
const startResponseSchema = {
  type: 'object', additionalProperties: false,
  properties: { runId: { type: 'string' }, status: { const: 'running' } },
  required: ['runId', 'status'],
} as const;
const statusResponseSchema = {
  type: 'object', additionalProperties: false,
  properties: {
    status: { type: 'string', enum: ['running', 'passed', 'confirmed_failure', 'inconclusive', 'test_error'] },
    reason: { type: 'string' },
    executionState: { type: 'string', enum: ['running', 'completed', 'incomplete'] },
    events: { type: 'array', maxItems: 40, items: {
      type: 'object', additionalProperties: false,
      properties: { stage: { type: 'string' }, message: { type: 'string' }, timestamp: { type: 'string' } },
      required: ['stage', 'message', 'timestamp'],
    } },
    artifacts: { type: 'array', maxItems: 16, items: {
      type: 'object', additionalProperties: false,
      properties: { id: { type: 'string' }, contentType: { type: 'string' }, size: { type: 'integer' } },
      required: ['id', 'contentType', 'size'],
    } },
    result: {
      type: 'object', additionalProperties: false,
      properties: {
        scenarioId: { type: 'string', enum: scenarioIds },
        status: { type: 'string', enum: ['passed', 'confirmed_failure', 'inconclusive'] },
        mouse: {
          type: 'object', additionalProperties: false,
          properties: { initialDate: { type: 'string' }, expectedDate: { type: 'string' }, observedDate: { type: 'string' }, verified: { type: 'boolean' } },
          required: ['initialDate', 'expectedDate', 'observedDate', 'verified'],
        },
        keyboard: {
          type: 'array', items: {
            type: 'object', additionalProperties: false,
            properties: {
              key: { type: 'string', enum: ['Enter', 'Space', 'Direct date entry'] }, focusedConfirm: { type: 'boolean' },
              focusedDateField: { type: 'boolean' }, focusedSaveAction: { type: 'boolean' },
              initialDate: { type: 'string' }, observedDate: { type: 'string' }, unchanged: { type: 'boolean' }, completed: { type: 'boolean' },
            },
            required: ['key', 'focusedConfirm', 'initialDate', 'observedDate', 'unchanged', 'completed'],
          },
        },
        regressionReplay: {
          type: 'object', additionalProperties: false,
          properties: {
            brokenExitCode: { anyOf: [{ type: 'integer' }, { type: 'null' }] },
            fixedExitCode: { anyOf: [{ type: 'integer' }, { type: 'null' }] },
            brokenFailsAsExpected: { type: 'boolean' }, fixedPasses: { type: 'boolean' },
          },
          required: ['brokenExitCode', 'fixedExitCode', 'brokenFailsAsExpected', 'fixedPasses'],
        },
        artifacts: { type: 'array', maxItems: 16, items: {
          type: 'object', additionalProperties: false,
          properties: { id: { type: 'string' }, contentType: { type: 'string' }, size: { type: 'integer' } },
          required: ['id', 'contentType', 'size'],
        } },
      },
      required: ['scenarioId', 'status', 'mouse', 'keyboard', 'artifacts'],
    },
  },
  required: ['status', 'executionState', 'events', 'artifacts'],
} as const;

export async function createApp(options: { serveClient?: boolean; workerTimeoutMs?: number } = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: false,
    bodyLimit: 1024,
    ajv: { customOptions: { removeAdditional: false } },
  });
  await app.register(rateLimit, { global: true, max: 240, timeWindow: 60_000, hook: 'preHandler' });
  const runs = new Map<string, RunRecord>();
  let activeWorker: ChildProcess | undefined;
  const eventClients = new Map<string, Set<(event: RunEvent) => void>>();

  const appendEvent = (runId: string, record: RunRecord, stage: string, message: string) => {
    const event = { stage, message: message.slice(0, 240), timestamp: new Date().toISOString() };
    record.events.push(event);
    if (record.events.length > 40) record.events.shift();
    for (const client of eventClients.get(runId) ?? []) client(event);
  };

  const deleteRun = async (runId: string, record: RunRecord) => {
    runs.delete(runId);
    eventClients.delete(runId);
    await rm(record.artifactDirectory, { recursive: true, force: true });
  };

  const pruneRuns = async () => {
    const now = Date.now();
    for (const [runId, record] of runs) {
      if (record.status !== 'running' && now - record.createdAt > RUN_RETENTION_MS) await deleteRun(runId, record);
    }
    if (runs.size >= MAX_RUNS) {
      const oldest = [...runs.entries()].filter(([, record]) => record.status !== 'running').sort((a, b) => a[1].createdAt - b[1].createdAt)[0];
      if (oldest) await deleteRun(oldest[0], oldest[1]);
    }
  };

  const retentionTimer = setInterval(() => { void pruneRuns(); }, 60_000);
  retentionTimer.unref();

  if (options.serveClient && existsSync(resolve(process.cwd(), 'dist', 'index.html'))) {
    await app.register(fastifyStatic, { root: resolve(process.cwd(), 'dist'), prefix: '/' });
  }

  app.post<{ Body: { scenarioId: ScenarioId } }>('/api/runs', {
    schema: { body: runBodySchema, response: { 202: startResponseSchema } },
    config: { rateLimit: { max: 5, timeWindow: 60_000 } },
  }, async (request, reply) => {
    if (activeWorker && activeWorker.exitCode === null) {
      return reply.code(503).send({ message: 'A browser run is already in progress.' });
    }

    await pruneRuns();
    if (runs.size >= MAX_RUNS) return reply.code(503).send({ message: 'Run history is full; try again after temporary evidence expires.' });

    const runId = randomUUID();
    const artifactDirectory = await mkdtemp(join(tmpdir(), 'switchpath-run-'));
    const record: RunRecord = {
      status: 'running', executionState: 'running', events: [], artifacts: [], createdAt: Date.now(), artifactDirectory,
    };
    runs.set(runId, record);
    appendEvent(runId, record, 'accepted', 'Scenario request accepted; preparing a fresh isolated run.');
    const workerPath = resolve(process.cwd(), 'src', 'runner', 'worker.ts');
    let child: ChildProcess;
    try {
      child = fork(workerPath, [], {
        cwd: process.cwd(),
        execArgv: ['--import', 'tsx'],
        stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
        env: safeWorkerEnvironment(),
      });
    } catch {
      runs.delete(runId);
      await rm(artifactDirectory, { recursive: true, force: true });
      return reply.code(503).send({ message: 'Playwright worker could not start.' });
    }
    activeWorker = child;

    const timeout = setTimeout(() => {
      if (record.status === 'running') {
        record.status = 'test_error';
        record.executionState = 'incomplete';
        record.reason = `Test Incomplete: Playwright execution exceeded the ${Math.round((options.workerTimeoutMs ?? 120_000) / 1000)}-second run timeout.`;
        appendEvent(runId, record, 'incomplete', record.reason);
        child.kill('SIGTERM');
      }
    }, options.workerTimeoutMs ?? 120_000).unref();
    record.timeout = timeout;

    child.on('message', (message: WorkerMessage) => {
      if (record.status !== 'running' || !isWorkerMessage(message)) return;
      if (message.type === 'progress') {
        appendEvent(runId, record, message.event.stage, message.event.message);
        return;
      }
      if (message.type === 'result') {
        record.handlingResult = true;
        void (async () => {
          const validOutcome = validateOutcome(message.result);
          const artifacts = await inventoryArtifacts(record.artifactDirectory);
          const totalBytes = artifacts.reduce((sum, artifact) => sum + artifact.size, 0);
          record.artifacts = artifacts.slice(0, MAX_ARTIFACT_COUNT);
          if (!validOutcome || artifacts.length > MAX_ARTIFACT_COUNT || totalBytes > MAX_ARTIFACT_BYTES) {
            record.status = validOutcome ? 'test_error' : 'inconclusive';
            record.executionState = 'incomplete';
            record.reason = validOutcome ? 'Captured evidence exceeded the configured safety limits.' : 'Inconclusive — Completion Not Verified.';
            appendEvent(runId, record, 'inconclusive', record.reason);
            return;
          }
          const { regressionTestSource, ...workerResult } = message.result;
          const publicResult = { ...workerResult, artifacts };
          if (regressionTestSource && message.result.status === 'confirmed_failure'
            && message.result.regressionReplay?.brokenFailsAsExpected && message.result.regressionReplay.fixedPasses
            && Buffer.byteLength(regressionTestSource) <= 100_000
            && totalBytes + Buffer.byteLength(regressionTestSource) <= MAX_ARTIFACT_BYTES) {
            const regressionPath = join(record.artifactDirectory, 'regression-test.spec.ts');
            await writeFile(regressionPath, regressionTestSource, { encoding: 'utf8', mode: 0o600 });
            artifacts.push({ id: 'regression-test.spec.ts', contentType: 'text/plain; charset=utf-8', size: Buffer.byteLength(regressionTestSource) });
            record.regressionTestSource = regressionTestSource;
          }
          record.result = publicResult;
          record.status = message.result.status;
          record.executionState = 'completed';
          appendEvent(runId, record, 'complete', `Run completed with ${record.status.replace('_', ' ')}.`);
        })().catch(async () => {
          record.status = 'test_error';
          record.executionState = 'incomplete';
          record.reason = 'Test Error: captured evidence could not be validated.';
          appendEvent(runId, record, 'error', record.reason);
          await rm(record.artifactDirectory, { recursive: true, force: true });
        }).finally(() => { record.handlingResult = false; });
      } else if (message.type === 'error') {
        record.status = 'test_error';
        record.executionState = 'incomplete';
        record.reason = message.reason;
        appendEvent(runId, record, message.category === 'navigation_timeout' ? 'incomplete' : 'error', message.reason);
        void inventoryArtifacts(record.artifactDirectory).then((artifacts) => {
          record.artifacts = artifacts.slice(0, MAX_ARTIFACT_COUNT);
        });
      }
    });
    child.on('error', () => {
      if (record.status === 'running' && !record.handlingResult) {
        record.status = 'test_error';
        record.executionState = 'incomplete';
        record.reason = 'Playwright worker could not start.';
        appendEvent(runId, record, 'browser_startup', record.reason);
      }
    });
    child.on('exit', (code) => {
      clearTimeout(timeout);
      record.timeout = undefined;
      if (record.status === 'running') {
        record.status = 'test_error';
        record.executionState = 'incomplete';
        record.reason = code === null ? 'Playwright worker was interrupted.' : 'Playwright worker exited before returning a result.';
        appendEvent(runId, record, 'incomplete', record.reason);
      }
      if (activeWorker === child) activeWorker = undefined;
    });

    child.send({ scenarioId: request.body.scenarioId, runId, artifactDirectory });
    return reply.code(202).send({ runId, status: 'running' as const });
  });

  app.get<{ Params: { runId: string } }>('/api/runs/:runId', {
    schema: { params: runIdParamsSchema, response: { 200: statusResponseSchema } },
  }, async (request, reply) => {
    const record = runs.get(request.params.runId);
    if (!record) return reply.code(404).send({ message: 'Run not found.' });
    return {
      status: record.status,
      executionState: record.executionState,
      reason: record.reason,
      events: record.events,
      artifacts: record.artifacts,
      result: record.result,
    };
  });

  app.get<{ Params: { runId: string } }>('/api/runs/:runId/events', {
    schema: { params: runIdParamsSchema },
  }, async (request, reply) => {
    const runId = request.params.runId;
    const record = runs.get(runId);
    if (!record) return reply.code(404).send({ message: 'Run not found.' });

    reply.hijack();
    reply.raw.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    });
    const send = (event: RunEvent, name = 'progress') => {
      reply.raw.write(`event: ${name}\ndata: ${JSON.stringify(event)}\n\n`);
    };
    for (const event of record.events) send(event);
    if (record.status !== 'running') {
      send({ stage: 'complete', message: `Run ended as ${record.status.replace('_', ' ')}.`, timestamp: new Date().toISOString() }, 'complete');
      reply.raw.end();
      return;
    }
    const clients = eventClients.get(runId) ?? new Set<(event: RunEvent) => void>();
    const client = (event: RunEvent) => send(event, ['complete', 'incomplete', 'error'].includes(event.stage) ? 'complete' : 'progress');
    clients.add(client);
    eventClients.set(runId, clients);
    const heartbeat = setInterval(() => reply.raw.write(': keep-alive\n\n'), 15_000);
    const close = () => {
      clearInterval(heartbeat);
      clients.delete(client);
      if (clients.size === 0) eventClients.delete(runId);
    };
    request.raw.once('close', close);
  });

  app.get<{ Params: { runId: string } }>('/api/runs/:runId/report', {
    schema: { params: runIdParamsSchema },
  }, async (request, reply) => {
    const record = runs.get(request.params.runId);
    if (!record) return reply.code(404).send({ message: 'Run not found.' });
    if (record.artifacts.length === 0) return reply.code(404).send({ message: 'No supporting evidence was captured for this run.' });
    const report = {
      runId: request.params.runId,
      status: record.status,
      executionState: record.executionState,
      reason: record.reason,
      scenarioId: record.result?.scenarioId,
      mouseAssertion: record.result?.mouse,
      keyboardAssertions: record.result?.keyboard,
      regressionReplay: record.result?.regressionReplay,
      events: record.events,
      artifacts: record.artifacts.map(({ id, contentType, size }) => ({ id, contentType, size })),
    };
    return reply.header('content-disposition', `attachment; filename="switchpath-${request.params.runId}-evidence.json"`).type('application/json').send(report);
  });

  app.get<{ Params: { runId: string; artifactId: string } }>('/api/runs/:runId/artifacts/:artifactId', {
    schema: { params: artifactParamsSchema },
  }, async (request, reply) => {
    const record = runs.get(request.params.runId);
    if (!record) return reply.code(404).send({ message: 'Run not found.' });
    const artifact = record.artifacts.find(({ id }) => id === request.params.artifactId);
    if (!artifact || !artifactIdPattern.test(artifact.id)) return reply.code(404).send({ message: 'Artifact not found.' });
    const path = join(record.artifactDirectory, artifact.id);
    try {
      const info = await lstat(path);
      if (!info.isFile() || info.isSymbolicLink() || info.size > MAX_ARTIFACT_BYTES) return reply.code(404).send({ message: 'Artifact not available.' });
      const data = await readFile(path);
      const disposition = artifact.contentType.startsWith('image/') || artifact.contentType === 'application/zip' ? 'inline' : 'attachment';
      return reply.header('content-disposition', `${disposition}; filename="${artifact.id}"`).type(artifact.contentType).send(data);
    } catch {
      return reply.code(404).send({ message: 'Artifact not available.' });
    }
  });

  app.get<{ Params: { runId: string } }>('/api/runs/:runId/regression-test', {
    schema: { params: runIdParamsSchema },
  }, async (request, reply) => {
    const record = runs.get(request.params.runId);
    if (!record) return reply.code(404).send({ message: 'Run not found.' });
    if (record.status !== 'confirmed_failure' || !record.result?.regressionReplay?.brokenFailsAsExpected || !record.result.regressionReplay.fixedPasses) {
      return reply.code(404).send({ message: 'No independently verified regression test is available.' });
    }
    const artifact = record.artifacts.find(({ id }) => id === 'regression-test.spec.ts');
    if (!artifact) return reply.code(404).send({ message: 'Regression test artifact is unavailable.' });
    const source = await readFile(join(record.artifactDirectory, artifact.id), 'utf8');
    return reply.header('content-disposition', 'attachment; filename="switchpath-regression.spec.ts"').type('text/plain; charset=utf-8').send(source);
  });

  app.addHook('onClose', async () => {
    clearInterval(retentionTimer);
    if (activeWorker && activeWorker.exitCode === null) {
      const worker = activeWorker;
      worker.kill('SIGTERM');
      await new Promise<void>((resolveExit) => {
        const fallback = setTimeout(() => {
          worker.kill('SIGKILL');
          resolveExit();
        }, 3_000);
        worker.once('exit', () => {
          clearTimeout(fallback);
          resolveExit();
        });
      });
    }
    for (const record of runs.values()) if (record.timeout) clearTimeout(record.timeout);
    await Promise.all([...runs.entries()].map(([runId, record]) => deleteRun(runId, record)));
  });
  return app;
}

export function safeWorkerEnvironment(): NodeJS.ProcessEnv {
  const allowed = ['PATH', 'HOME', 'TMPDIR', 'TEMP', 'TMP', 'PLAYWRIGHT_BROWSERS_PATH', 'XDG_CACHE_HOME'];
  return Object.fromEntries(allowed.flatMap((key) => process.env[key] ? [[key, process.env[key]]] : []));
}

function validateOutcome(result: RunResult): boolean {
  const mouseValid = result.mouse.verified
    && result.mouse.initialDate === '2026-10-10'
    && result.mouse.expectedDate === '2026-10-20'
    && result.mouse.observedDate === '2026-10-20';
  if (!mouseValid) return false;
  if (result.scenarioId === 'broken') {
    return result.status === 'confirmed_failure'
      && result.keyboard.length === 2
      && result.keyboard.some((attempt) => attempt.key === 'Enter' && attempt.focusedConfirm && attempt.unchanged && attempt.observedDate === '2026-10-10')
      && result.keyboard.some((attempt) => attempt.key === 'Space' && attempt.focusedConfirm && attempt.unchanged && attempt.observedDate === '2026-10-10')
      && result.regressionReplay?.brokenFailsAsExpected === true
      && result.regressionReplay.fixedPasses === true;
  }
  if (result.scenarioId === 'fixed') {
    return result.status === 'passed' && result.keyboard.length === 2
      && result.keyboard.every((attempt) => attempt.focusedConfirm && attempt.completed && attempt.observedDate === '2026-10-20')
      && result.keyboard.some((attempt) => attempt.key === 'Enter')
      && result.keyboard.some((attempt) => attempt.key === 'Space');
  }
  return result.status === 'passed' && result.keyboard.length === 1
    && result.keyboard[0].key === 'Direct date entry'
    && result.keyboard[0].focusedDateField === true
    && result.keyboard[0].focusedSaveAction === true
    && result.keyboard[0].completed
    && result.keyboard[0].observedDate === '2026-10-20';
}

async function inventoryArtifacts(directory: string): Promise<Array<{ id: string; contentType: string; size: number }>> {
  let names: string[];
  try {
    names = await readdir(directory);
  } catch {
    return [];
  }
  const artifacts: Array<{ id: string; contentType: string; size: number }> = [];
  for (const id of names) {
    if (!artifactIdPattern.test(id) || artifacts.length >= MAX_ARTIFACT_COUNT) continue;
    try {
      const info = await lstat(join(directory, id));
      if (!info.isFile() || info.isSymbolicLink() || info.size > MAX_ARTIFACT_BYTES) continue;
      const contentType = id.endsWith('.png') ? 'image/png'
        : id.endsWith('.trace.zip') ? 'application/zip'
          : id.endsWith('.log.json') ? 'application/json'
            : 'text/plain; charset=utf-8';
      artifacts.push({ id, contentType, size: info.size });
    } catch {
      continue;
    }
  }
  return artifacts;
}

function isWorkerMessage(value: unknown): value is WorkerMessage {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as { type?: unknown; result?: RunResult; reason?: unknown; category?: unknown; event?: RunEvent };
  if (candidate.type === 'progress') {
    return typeof candidate.event?.stage === 'string'
      && candidate.event.stage.length <= 32
      && typeof candidate.event.message === 'string'
      && candidate.event.message.length <= 240
      && typeof candidate.event.timestamp === 'string';
  }
  if (candidate.type === 'error') {
    return typeof candidate.reason === 'string' && candidate.reason.length <= 240
      && ['browser_startup', 'navigation_timeout', 'execution_error'].includes(String(candidate.category));
  }
  return candidate.type === 'result'
    && !!candidate.result
    && scenarioIds.includes(candidate.result.scenarioId)
    && ['passed', 'confirmed_failure', 'inconclusive'].includes(candidate.result.status)
    && Array.isArray(candidate.result.artifacts)
    && candidate.result.artifacts.every((artifact) => artifactIdPattern.test(artifact.id) && artifact.size >= 0 && artifact.size <= MAX_ARTIFACT_BYTES);
}
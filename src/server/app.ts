import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance } from 'fastify';
import { fork, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

type ScenarioId = 'broken' | 'fixed' | 'alternative';
type RunResult = {
  scenarioId: 'broken';
  status: 'confirmed_failure' | 'inconclusive';
  mouse: { expectedDate: string; observedDate: string; verified: boolean };
  keyboard: Array<{
    key: 'Enter' | 'Space';
    focusedConfirm: boolean;
    initialDate: string;
    observedDate: string;
    unchanged: boolean;
  }>;
};
type RunRecord = {
  status: 'running' | 'confirmed_failure' | 'inconclusive' | 'test_error';
  reason?: string;
  result?: RunResult;
};
type WorkerMessage =
  | { type: 'result'; result: RunResult }
  | { type: 'error'; reason: string };

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
const startResponseSchema = {
  type: 'object', additionalProperties: false,
  properties: { runId: { type: 'string' }, status: { const: 'running' } },
  required: ['runId', 'status'],
} as const;
const statusResponseSchema = {
  type: 'object', additionalProperties: false,
  properties: {
    status: { type: 'string', enum: ['running', 'confirmed_failure', 'inconclusive', 'test_error'] },
    reason: { type: 'string' },
    result: {
      type: 'object', additionalProperties: false,
      properties: {
        scenarioId: { const: 'broken' },
        status: { type: 'string', enum: ['confirmed_failure', 'inconclusive'] },
        mouse: {
          type: 'object', additionalProperties: false,
          properties: { expectedDate: { type: 'string' }, observedDate: { type: 'string' }, verified: { type: 'boolean' } },
          required: ['expectedDate', 'observedDate', 'verified'],
        },
        keyboard: {
          type: 'array', items: {
            type: 'object', additionalProperties: false,
            properties: {
              key: { type: 'string', enum: ['Enter', 'Space'] }, focusedConfirm: { type: 'boolean' },
              initialDate: { type: 'string' }, observedDate: { type: 'string' }, unchanged: { type: 'boolean' },
            },
            required: ['key', 'focusedConfirm', 'initialDate', 'observedDate', 'unchanged'],
          },
        },
      },
      required: ['scenarioId', 'status', 'mouse', 'keyboard'],
    },
  },
  required: ['status'],
} as const;

export function createApp(options: { serveClient?: boolean } = {}): FastifyInstance {
  const app = Fastify({
    logger: false,
    bodyLimit: 1024,
    ajv: { customOptions: { removeAdditional: false } },
  });
  const runs = new Map<string, RunRecord>();
  let activeWorker: ChildProcess | undefined;

  if (options.serveClient && existsSync(resolve(process.cwd(), 'dist', 'index.html'))) {
    void app.register(fastifyStatic, { root: resolve(process.cwd(), 'dist'), prefix: '/' });
  }

  app.post<{ Body: { scenarioId: ScenarioId } }>('/api/runs', {
    schema: { body: runBodySchema, response: { 202: startResponseSchema } },
  }, async (request, reply) => {
    if (request.body.scenarioId !== 'broken') {
      return reply.code(501).send({ message: 'This scenario is not implemented yet.' });
    }
    if (activeWorker && activeWorker.exitCode === null) {
      return reply.code(503).send({ message: 'A browser run is already in progress.' });
    }

    const runId = randomUUID();
    const record: RunRecord = { status: 'running' };
    runs.set(runId, record);
    const workerPath = resolve(process.cwd(), 'src', 'runner', 'worker.ts');
    const child = fork(workerPath, [], {
      cwd: process.cwd(),
      execArgv: ['--import', 'tsx'],
      stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
      env: safeWorkerEnvironment(),
    });
    activeWorker = child;

    const timeout = setTimeout(() => {
      if (record.status === 'running') {
        record.status = 'test_error';
        record.reason = 'Playwright worker timed out.';
        child.kill('SIGTERM');
      }
    }, 30_000);

    child.on('message', (message: WorkerMessage) => {
      if (record.status !== 'running' || !isWorkerMessage(message)) return;
      if (message.type === 'result' && message.result.scenarioId === 'broken') {
        record.status = message.result.status;
        record.result = message.result;
      } else if (message.type === 'error') {
        record.status = 'test_error';
        record.reason = 'Playwright execution error.';
      }
    });
    child.on('error', () => {
      if (record.status === 'running') {
        record.status = 'test_error';
        record.reason = 'Playwright worker could not start.';
      }
    });
    child.on('exit', (code) => {
      clearTimeout(timeout);
      if (record.status === 'running') {
        record.status = 'test_error';
        record.reason = code === null ? 'Playwright worker was interrupted.' : 'Playwright worker exited before returning a result.';
      }
      if (activeWorker === child) activeWorker = undefined;
    });

    child.send({ scenarioId: 'broken' satisfies ScenarioId });
    return reply.code(202).send({ runId, status: 'running' as const });
  });

  app.get<{ Params: { runId: string } }>('/api/runs/:runId', {
    schema: { params: runIdParamsSchema, response: { 200: statusResponseSchema } },
  }, async (request, reply) => {
    const record = runs.get(request.params.runId);
    if (!record) return reply.code(404).send({ message: 'Run not found.' });
    return record;
  });

  app.addHook('onClose', async () => {
    if (activeWorker && activeWorker.exitCode === null) activeWorker.kill('SIGTERM');
  });
  return app;
}

export function safeWorkerEnvironment(): NodeJS.ProcessEnv {
  const allowed = ['PATH', 'HOME', 'TMPDIR', 'TEMP', 'TMP', 'PLAYWRIGHT_BROWSERS_PATH', 'XDG_CACHE_HOME'];
  return Object.fromEntries(allowed.flatMap((key) => process.env[key] ? [[key, process.env[key]]] : []));
}

function isWorkerMessage(value: unknown): value is WorkerMessage {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as { type?: unknown; result?: { scenarioId?: unknown; status?: unknown }; reason?: unknown };
  if (candidate.type === 'error') return typeof candidate.reason === 'string';
  return candidate.type === 'result'
    && candidate.result?.scenarioId === 'broken'
    && ['confirmed_failure', 'inconclusive'].includes(String(candidate.result.status));
}
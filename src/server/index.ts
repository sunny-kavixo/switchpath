import { createApp } from './app';

const app = await createApp({ serveClient: true });
const port = Number(process.env.PORT ?? 3000);
const host = process.env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1';

try {
  await app.listen({ port, host });
  app.log.info(`SwitchPath API listening on ${host}:${port}`);
} catch {
  process.stderr.write('SwitchPath server failed to start.\n');
  process.exitCode = 1;
}
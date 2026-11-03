import { startServer } from '../../src/server.ts';
import { writeSync } from 'node:fs';

let runtime;
try {
  const publicUrl = process.env.UI_QA_PUBLIC_URL;
  const dataDir = process.env.BOT_DATA_DIR;
  if (!publicUrl || !dataDir) throw new Error('Missing isolated UI QA server configuration.');
  runtime = await startServer({ dataDir, host: '127.0.0.1', port: 0, publicUrl, trustedUrls: [] });
  const address = runtime.server.address();
  if (!address || typeof address === 'string' || address.address !== '127.0.0.1' || !Number.isInteger(address.port) || address.port < 1)
    throw new Error('Standalone server did not bind a valid ephemeral loopback port.');
  writeSync(3, `${JSON.stringify({ event: 'ready', pid: process.pid, port: address.port })}\n`);
} catch (error) {
  const code = typeof error?.code === 'string' ? error.code : 'ui-qa-server-start-failed';
  process.stderr.write(`${JSON.stringify({ event: 'failed', code })}\n`);
  process.exitCode = 1;
}

if (runtime) {
  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    try {
      await runtime.close();
    } catch {
      process.exitCode = 1;
    }
  };
  process.on('SIGTERM', () => void stop());
  process.on('SIGINT', () => void stop());
}

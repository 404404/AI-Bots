import { appendFileSync } from 'node:fs';

const evidence = process.env.BOTHARNESS_PRIVATE_WIRE_EVIDENCE;
if (!evidence) throw new Error('Set BOTHARNESS_PRIVATE_WIRE_EVIDENCE to a task-owned file');
const canaries = [
  'SYNTHETIC-1380-key-A',
  'SYNTHETIC-1380-secret-A',
  'SYNTHETIC-1380-url-A',
  'http://127.0.0.1:31381/status?marker=SYNTHETIC-1380-url-A',
];
const patterns = canaries.flatMap((value) => [
  value,
  Buffer.from(value).toString('base64'),
  encodeURIComponent(value),
]);
const original = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (url.includes('deepseek') && url.endsWith('/messages') && init?.method === 'POST') {
    const body = String(init.body ?? '');
    appendFileSync(
      evidence,
      JSON.stringify({
        phase: 'model-wire-request',
        bodyBytes: Buffer.byteLength(body),
        canaryMatches: patterns.filter((pattern) => body.includes(pattern)).length,
      }) + '\n',
    );
  }
  return original(input, init);
};

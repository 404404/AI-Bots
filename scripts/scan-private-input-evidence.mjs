import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve, basename } from 'node:path';
import { zstdDecompressSync } from 'node:zlib';

const home = resolve(process.argv[2] ?? '');
if (process.argv.length !== 3)
  throw new Error('Usage: node scripts/scan-private-input-evidence.mjs <isolated-DSH_HOME>');
const canaries = [
  'SYNTHETIC-1380-key-A',
  'SYNTHETIC-1380-secret-A',
  'SYNTHETIC-1380-url-A',
  'http://127.0.0.1:31381/status?marker=SYNTHETIC-1380-url-A',
];
const patterns = [
  ...new Set(
    canaries.flatMap((value) => [
      value,
      Buffer.from(value).toString('base64'),
      encodeURIComponent(value),
    ]),
  ),
];
let files = 0;
let sessionEvents = 0;
let requestHeaders = 0;
let toolResults = 0;
const violations = [];
for (const entry of readdirSync(home, { recursive: true, withFileTypes: true })) {
  if (!entry.isFile()) continue;
  const file = join(entry.parentPath, entry.name);
  if (basename(file) === '.credentials.yaml' || basename(file) === 'wire-canary-probe.mjs')
    continue;
  let data = readFileSync(file);
  if (file.endsWith('.zstd')) {
    let offset = 0;
    const frames = [];
    while (offset < data.length) {
      const frame = zstdDecompressSync(data.subarray(offset), { info: true });
      if (frame.engine.bytesWritten === 0) throw new Error('Native Session frame did not advance');
      offset += frame.engine.bytesWritten;
      frames.push(frame.buffer);
    }
    data = Buffer.concat(frames);
    for (const line of data.toString().trim().split('\n')) {
      const event = JSON.parse(line);
      if (event.type !== 'session') sessionEvents++;
      if (event.type === 'request/header') requestHeaders++;
      if (event.type === 'tool/result') toolResults++;
    }
  }
  files++;
  const texts = [data.toString('utf8'), data.toString('utf16le')];
  if (patterns.some((pattern) => texts.some((text) => text.includes(pattern))))
    violations.push(file.slice(home.length + 1));
}
const store = readFileSync(join(home, '.credentials.yaml'), 'utf8');
const result = {
  files,
  sessionEvents,
  requestHeaders,
  toolResults,
  nativeStoreContainsSyntheticValues: canaries.every((value) => store.includes(value)),
  violations,
};
process.stdout.write(JSON.stringify(result, null, 2) + '\n');
if (violations.length > 0) process.exitCode = 1;

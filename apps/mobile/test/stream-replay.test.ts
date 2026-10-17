import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, expect, it } from 'vitest';

let child: ChildProcess | undefined;
let control: string | undefined;
afterEach(async () => {
  if (child !== undefined) {
    const exit = once(child, 'exit');
    child.kill();
    await exit;
    child = undefined;
  }
  if (control !== undefined) {
    await unlink(control);
    control = undefined;
  }
});

async function server() {
  control = join(tmpdir(), `botharness-replay-${randomUUID()}.json`);
  await writeFile(control, JSON.stringify({ slug: 'qa-bot', runId: 'first', fixture: 'smoke' }), {
    flag: 'wx',
  });
  child = spawn(
    process.execPath,
    [
      fileURLToPath(new URL('../scripts/stream-replay.mjs', import.meta.url)),
      '--port',
      '0',
      '--control',
      control,
    ],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );
  const [chunk] = await once(child.stdout!, 'data');
  const { listening } = JSON.parse(String(chunk));
  return `http://127.0.0.1:${listening}`;
}

const request = (role = 'user', stream = false) => ({
  stream,
  messages: [{ role, content: 'QA replay' }],
  tools: [{ type: 'function', function: { name: 'channel_send' } }],
});
const post = (base: string, body: unknown) =>
  fetch(base + '/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

it('sends exactly one fixture per armed run and does not consume a run for tool completion', async () => {
  const base = await server();
  const completion = await (await post(base, request('tool'))).json();
  expect(completion.choices[0].finish_reason).toBe('stop');
  const first = await (await post(base, request())).json();
  const args = JSON.parse(first.choices[0].message.tool_calls[0].function.arguments);
  expect(args.channel_id).toBe('dm-qa-bot');
  expect(args.body).toContain('AX_REPLAY_OK');
  const second = await (await post(base, request())).json();
  expect(second.choices[0].message.tool_calls).toBeUndefined();
  await writeFile(control!, JSON.stringify({ slug: 'qa-bot', runId: 'second', fixture: 'long' }));
  const next = await (await post(base, request())).json();
  expect(
    JSON.parse(next.choices[0].message.tool_calls[0].function.arguments).body.length,
  ).toBeGreaterThan(10000);
});

it('streams valid tool arguments with complete emoji and rejects invalid control fixtures', async () => {
  const base = await server();
  const response = await post(base, request('user', true));
  expect(response.headers.get('content-type')).toBe('text/event-stream');
  const events = (await response.text())
    .split('\n\n')
    .filter((line) => line.startsWith('data: ') && line !== 'data: [DONE]')
    .map((line) => JSON.parse(line.slice(6)));
  const args = events
    .map((event) => event.choices[0].delta.tool_calls?.[0]?.function.arguments ?? '')
    .join('');
  expect(JSON.parse(args).body).toContain('👨‍👩‍👧‍👦');
  expect(events.at(-1).choices[0].finish_reason).toBe('tool_calls');
  await writeFile(
    control!,
    JSON.stringify({ slug: 'qa-bot', runId: 'third', fixture: '__proto__' }),
  );
  const invalid = await post(base, request());
  expect(invalid.status).toBe(400);
  expect(await invalid.json()).toEqual({ error: { message: 'INVALID_REPLAY_REQUEST' } });
});

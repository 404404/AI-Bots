import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

const origin = 'http://fixture.test:8081';
const gateway = process.env.BROWSER_GATEWAY_URL || 'http://gateway:8090';
const token = process.env.BROWSER_CONTROL_TOKEN;
if (!token || token.length < 32) throw new Error('BROWSER_CONTROL_TOKEN must be configured.');

async function request(path, body) {
  const response = await fetch(`${gateway}${path}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(25_000),
  });
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.startsWith('image/')) return { status: response.status, bytes: Buffer.from(await response.arrayBuffer()), contentType };
  const value = await response.json();
  return { status: response.status, value };
}

async function operation(session, sequence, action, args = {}) {
  const result = await request(`/v1/sessions/${session.sessionId}/operations`, {
    botId: session.botId,
    taskId: session.taskId,
    sequence,
    operationId: randomUUID(),
    action,
    args,
  });
  assert.equal(result.status, 200, JSON.stringify(result.value));
  assert.equal(result.value.status, 'completed');
  return result.value.result;
}

async function openSession(botId, taskId) {
  const response = await request('/v1/sessions', { operationId: randomUUID(), botId, taskId, leaseMs: 60_000, allowedOrigins: [origin] });
  assert.equal(response.status, 201, JSON.stringify(response.value));
  return { ...response.value, botId, taskId };
}

const botA = `e2e-${randomUUID()}`;
const taskA = `task-${randomUUID()}`;
const sessionA = await openSession(botA, taskA);
try {
  const countPage = await operation(sessionA, 1, 'navigate', { url: `${origin}/count` });
  assert.equal(countPage.url, `${origin}/count`);
  const beforeText = await operation(sessionA, 2, 'read');
  const before = Number(beforeText.text.match(/Count:\s*(\d+)/u)?.[1]);
  assert.ok(Number.isInteger(before));
  await operation(sessionA, 3, 'navigate', { url: `${origin}/` });
  assert.deepEqual(await operation(sessionA, 4, 'type', { selector: '#note', text: 'one isolated fixture action' }), { typed: true, characters: 27 });
  assert.equal((await operation(sessionA, 5, 'scroll', { direction: 'down', pixels: 120 })).scrolled, 'down');
  await operation(sessionA, 6, 'click', { selector: '#increment' });
  const afterText = await operation(sessionA, 7, 'read');
  assert.match(afterText.text, new RegExp(`Count:\\s*${before + 1}`, 'u'));
  const screenshot = await operation(sessionA, 8, 'screenshot');
  const image = await request(`/v1/sessions/${sessionA.sessionId}/screenshots/${screenshot.resourceId}`, { botId: botA, taskId: taskA });
  assert.equal(image.status, 200);
  assert.equal(image.contentType, 'image/png');
  assert.ok(image.bytes.length > 100);
  const denied = await request(`/v1/sessions/${sessionA.sessionId}/operations`, {
    botId: botA, taskId: taskA, sequence: 9, operationId: randomUUID(), action: 'navigate', args: { url: 'http://169.254.169.254/latest/meta-data/' },
  });
  assert.equal(denied.status, 403);
  assert.equal(denied.value.error.code, 'target-origin-denied');
} finally {
  await request(`/v1/sessions/${sessionA.sessionId}/close`, { botId: botA, taskId: taskA });
}

const botB = `e2e-${randomUUID()}`;
const taskB = `task-${randomUUID()}`;
const sessionB = await openSession(botB, taskB);
try {
  await operation(sessionB, 1, 'navigate', { url: `${origin}/isolation` });
  const observed = await operation(sessionB, 2, 'read');
  assert.equal(observed.text.includes('fixture-session'), false, 'a new context must not inherit cookies from another Bot/task');
} finally {
  await request(`/v1/sessions/${sessionB.sessionId}/close`, { botId: botB, taskId: taskB });
}

process.stdout.write(JSON.stringify({ result: 'pass', operations: 11, screenshotBytes: 'captured-after-action', fixtureCountIncremented: true, isolatedCookieAbsent: true }) + '\n');

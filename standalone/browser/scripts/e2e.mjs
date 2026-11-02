import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

const origin = 'http://fixture.test:8081';
const secureOrigin = 'https://fixture.test:8443';
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

const healthResponse = await fetch(`${gateway}/healthz`, { signal: AbortSignal.timeout(5000) });
const health = await healthResponse.json();
assert.equal(healthResponse.status, 200, JSON.stringify(health));
assert.deepEqual(health.capabilities, { version: 1, queryPolicy: 'deny' }, 'browser_read E2E requires the worker to report enforced query denial');

async function operation(session, sequence, action, args = {}) {
  const result = await operationRequest(session, sequence, action, args);
  assert.equal(result.status, 200, JSON.stringify(result.value));
  assert.equal(result.value.status, 'completed');
  return result.value.result;
}

function operationRequest(session, sequence, action, args = {}, operationId = randomUUID()) {
  return request(`/v1/sessions/${session.sessionId}/operations`, {
    botId: session.botId,
    taskId: session.taskId,
    requiredPolicy: { version: 1, queryPolicy: 'deny' },
    sequence,
    operationId,
    action,
    args,
  });
}

async function openSession(botId, taskId) {
  const response = await request('/v1/sessions', { operationId: randomUUID(), botId, taskId, leaseMs: 60_000, allowedOrigins: [origin], requiredPolicy: { version: 1, queryPolicy: 'deny' } });
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
  const incrementOperationId = randomUUID();
  const firstIncrement = await operationRequest(sessionA, 6, 'click', { selector: '#increment' }, incrementOperationId);
  const repeatedIncrement = await operationRequest(sessionA, 6, 'click', { selector: '#increment' }, incrementOperationId);
  assert.equal(firstIncrement.status, 200, JSON.stringify(firstIncrement.value));
  assert.deepEqual(repeatedIncrement, firstIncrement, 'repeating an operation ID must return the cached result');
  const afterText = await operation(sessionA, 7, 'read');
  assert.match(afterText.text, new RegExp(`Count:\\s*${before + 1}`, 'u'));
  const screenshot = await operation(sessionA, 8, 'screenshot');
  const wrongBotImage = await request(`/v1/sessions/${sessionA.sessionId}/screenshots/${screenshot.resourceId}`, { botId: `${botA}-other`, taskId: taskA, requiredPolicy: { version: 1, queryPolicy: 'deny' } });
  assert.equal(wrongBotImage.status, 404, 'screenshot must reject a different Bot owner');
  const wrongTaskImage = await request(`/v1/sessions/${sessionA.sessionId}/screenshots/${screenshot.resourceId}`, { botId: botA, taskId: `${taskA}-other`, requiredPolicy: { version: 1, queryPolicy: 'deny' } });
  assert.equal(wrongTaskImage.status, 404, 'screenshot must reject a different task owner');
  const image = await request(`/v1/sessions/${sessionA.sessionId}/screenshots/${screenshot.resourceId}`, { botId: botA, taskId: taskA, requiredPolicy: { version: 1, queryPolicy: 'deny' } });
  assert.equal(image.status, 200);
  assert.equal(image.contentType, 'image/png');
  assert.ok(image.bytes.length > 100);
  const denied = await request(`/v1/sessions/${sessionA.sessionId}/operations`, {
    botId: botA, taskId: taskA, requiredPolicy: { version: 1, queryPolicy: 'deny' }, sequence: 9, operationId: randomUUID(), action: 'navigate', args: { url: 'http://169.254.169.254/latest/meta-data/' },
  });
  assert.equal(denied.status, 403);
  assert.equal(denied.value.error.code, 'target-origin-denied');
  const httpsRedirect = await request(`/v1/sessions/${sessionA.sessionId}/operations`, {
    botId: botA, taskId: taskA, requiredPolicy: { version: 1, queryPolicy: 'deny' }, sequence: 10, operationId: randomUUID(), action: 'navigate', args: { url: `${origin}/redirect-https-query` },
  });
  assert.ok(httpsRedirect.status >= 400, JSON.stringify(httpsRedirect.value));
} finally {
  await request(`/v1/sessions/${sessionA.sessionId}/close`, { botId: botA, taskId: taskA, requiredPolicy: { version: 1, queryPolicy: 'deny' } });
}

const botB = `e2e-${randomUUID()}`;
const taskB = `task-${randomUUID()}`;
const sessionB = await openSession(botB, taskB);
try {
  await operation(sessionB, 1, 'navigate', { url: `${origin}/isolation` });
  const observed = await operation(sessionB, 2, 'read');
  assert.equal(observed.text.includes('fixture-session'), false, 'a new context must not inherit cookies from another Bot/task');
  await operation(sessionB, 3, 'navigate', { url: `${origin}/popup-page` });
  await operation(sessionB, 4, 'click', { selector: '#open-popup' });
  let popupCounts;
  let popupSequence = 5;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await operation(sessionB, popupSequence++, 'navigate', { url: `${origin}/request-count` });
    popupCounts = JSON.parse((await operation(sessionB, popupSequence++, 'read')).text);
    if (popupCounts.popupRedirectRequests >= 1) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.ok(popupCounts.popupRedirectRequests >= 1, 'fixture must observe the real popup initial request');
  assert.equal(popupCounts.requestCount, 0, 'popup redirect query must be blocked before the fixture hit endpoint');
} finally {
  await request(`/v1/sessions/${sessionB.sessionId}/close`, { botId: botB, taskId: taskB, requiredPolicy: { version: 1, queryPolicy: 'deny' } });
}

const botC = `e2e-${randomUUID()}`;
const taskC = `task-${randomUUID()}`;
const deniedHttpsSession = await request('/v1/sessions', {
  operationId: randomUUID(), botId: `e2e-${randomUUID()}`, taskId: `task-${randomUUID()}`,
  allowedOrigins: [secureOrigin], requiredPolicy: { version: 1, queryPolicy: 'deny' },
});
assert.equal(deniedHttpsSession.status, 403);
assert.equal(deniedHttpsSession.value.error.code, 'strict-https-denied');

const sessionC = await openSession(botC, taskC);
try {
  assert.deepEqual(sessionC.enforcedPolicy, { version: 1, queryPolicy: 'deny' });
  const deniedQuery = await request(`/v1/sessions/${sessionC.sessionId}/operations`, {
    botId: botC, taskId: taskC, requiredPolicy: { version: 1, queryPolicy: 'deny' }, sequence: 1, operationId: randomUUID(), action: 'navigate', args: { url: `${origin}/?secret=value` },
  });
  assert.equal(deniedQuery.status, 403);
  assert.equal(deniedQuery.value.error.code, 'target-query-denied');

  const redirected = await request(`/v1/sessions/${sessionC.sessionId}/operations`, {
    botId: botC, taskId: taskC, requiredPolicy: { version: 1, queryPolicy: 'deny' }, sequence: 2, operationId: randomUUID(), action: 'navigate', args: { url: `${origin}/redirect-query` },
  });
  assert.ok(redirected.status >= 400, JSON.stringify(redirected.value));
  await operation(sessionC, 3, 'navigate', { url: `${origin}/query-page` });
  await operation(sessionC, 4, 'navigate', { url: `${origin}/request-count` });
  const counter = await operation(sessionC, 5, 'read');
  assert.match(counter.text, /"requestCount":0/u, 'redirect and subresource query URLs must not reach the isolated fixture');
} finally {
  await request(`/v1/sessions/${sessionC.sessionId}/close`, { botId: botC, taskId: taskC, requiredPolicy: { version: 1, queryPolicy: 'deny' } });
}

const botD = `e2e-${randomUUID()}`;
const taskD = `task-${randomUUID()}`;
const sessionD = await openSession(botD, taskD);
try {
  const slowNavigation = operationRequest(sessionD, 1, 'navigate', { url: `${origin}/slow` });
  await new Promise((resolve) => setTimeout(resolve, 500));
  const observer = await openSession(`e2e-${randomUUID()}`, `task-${randomUUID()}`);
  try {
    await operation(observer, 1, 'navigate', { url: `${origin}/slow-status` });
    const slowStatus = JSON.parse((await operation(observer, 2, 'read')).text);
    assert.ok(slowStatus.slowRequests >= 1, 'fixture must confirm the slow request is actually in flight before cancel');
  } finally {
    await request(`/v1/sessions/${observer.sessionId}/close`, { botId: observer.botId, taskId: observer.taskId, requiredPolicy: { version: 1, queryPolicy: 'deny' } });
  }
  const cancellation = await request(`/v1/sessions/${sessionD.sessionId}/cancel`, { botId: botD, taskId: taskD, requiredPolicy: { version: 1, queryPolicy: 'deny' } });
  assert.equal(cancellation.status, 200, JSON.stringify(cancellation.value));
  const cancelledNavigation = await slowNavigation;
  assert.ok(cancelledNavigation.status >= 400, 'cancelled in-flight navigation must not report completed');
  assert.notEqual(cancelledNavigation.value?.status, 'completed');
  const afterCancel = await request(`/v1/sessions/${sessionD.sessionId}/operations`, {
    botId: botD, taskId: taskD, requiredPolicy: { version: 1, queryPolicy: 'deny' }, sequence: 2, operationId: randomUUID(), action: 'read',
  });
  assert.ok(afterCancel.status >= 400, 'cancelled session must reject subsequent operations');
} finally {
  await request(`/v1/sessions/${sessionD.sessionId}/close`, { botId: botD, taskId: taskD, requiredPolicy: { version: 1, queryPolicy: 'deny' } });
}

const botE = `e2e-${randomUUID()}`;
const taskE = `task-${randomUUID()}`;
const sessionE = await openSession(botE, taskE);
const timeoutObserver = await openSession(`e2e-${randomUUID()}`, `task-${randomUUID()}`);
try {
  await operation(timeoutObserver, 1, 'navigate', { url: `${origin}/slow-status` });
  const baselineSlowRequests = JSON.parse((await operation(timeoutObserver, 2, 'read')).text).slowRequests;
  assert.ok(Number.isInteger(baselineSlowRequests));
  const timeoutStartedAt = Date.now();
  const timeout = await operationRequest(sessionE, 1, 'navigate', { url: `${origin}/slow` });
  const timeoutElapsedMs = Date.now() - timeoutStartedAt;
  assert.equal(timeout.status, 504, JSON.stringify(timeout.value));
  assert.equal(timeout.value.error.code, 'navigation-timeout', JSON.stringify(timeout.value));
  assert.ok(timeoutElapsedMs >= 12_000 && timeoutElapsedMs < 22_000, `navigation timeout elapsed outside the expected bound: ${timeoutElapsedMs}ms`);
  await operation(timeoutObserver, 3, 'navigate', { url: `${origin}/slow-status` });
  const slowStatus = JSON.parse((await operation(timeoutObserver, 4, 'read')).text);
  assert.equal(slowStatus.slowRequests, baselineSlowRequests + 1, 'the timed-out navigation must increment the fixture slow-request counter exactly once');
  assert.equal((await operation(sessionE, 2, 'navigate', { url: `${origin}/count` })).url, `${origin}/count`, 'session context must remain usable after navigation timeout');
} finally {
  await request(`/v1/sessions/${timeoutObserver.sessionId}/close`, { botId: timeoutObserver.botId, taskId: timeoutObserver.taskId, requiredPolicy: { version: 1, queryPolicy: 'deny' } });
  await request(`/v1/sessions/${sessionE.sessionId}/close`, { botId: botE, taskId: taskE, requiredPolicy: { version: 1, queryPolicy: 'deny' } });
}

process.stdout.write(JSON.stringify({ result: 'pass', screenshotScopeDenied: true, operationIdSideEffectOnce: true, cancellationCleanupVerified: true, navigationTimeoutVerified: true, fixtureCountIncremented: true, isolatedCookieAbsent: true, popupRedirectAndQueryBlocked: true, queryRedirectAndSubresourceBlocked: true }) + '\n');

import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { rmSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { createRestrictedProxy } from '../src/proxy.mjs';
import { BrowserWorker } from '../src/worker.mjs';

const origin = 'http://fixture.test:8081';
const rules = { [origin]: { addresses: ['172.31.240.10'], allowPrivate: true } };
const proxyToken = 'proxy-internal-test-token-is-not-a-real-secret-0001';

function makeFakeBrowser(sandbox = 'Layer 1 Sandbox Namespace\nPID namespaces Yes\nSeccomp-BPF sandbox Yes') {
  const opened = [];
  const browser = {
    async newContext() {
      const context = {
        routes: [],
        async newPage() {
          const state = { currentUrl: 'about:blank', clicks: 0, fills: [], scrolls: [] };
          const page = {
            state,
            async goto(url) { state.currentUrl = url; },
            url() { return state.currentUrl; },
            locator(selector) {
              return {
                async innerText() { return selector === 'body' ? (state.currentUrl === 'chrome://sandbox' ? sandbox : 'Fixture content Count: 0') : 'Fixture element'; },
                async click() { state.clicks += 1; },
                async fill(value) { state.fills.push({ selector, value }); },
              };
            },
            mouse: { async wheel(x, y) { state.scrolls.push([x, y]); } },
            async screenshot() { return Buffer.from('PNG-fixture-bytes'); },
            on() {},
          };
          context.page = page;
          opened.push(context);
          return page;
        },
        async close() { context.closed = true; },
        setDefaultTimeout() {},
        setDefaultNavigationTimeout() {},
        route(pattern, handler) { context.routes.push([pattern, handler]); },
        routeWebSocket(pattern, handler) { context.websocketHandler = handler; },
        on() {},
      };
      return context;
    },
    async close() { browser.closed = true; },
  };
  return { browser, opened };
}

async function setup(t, sandbox = 'Layer 1 Sandbox Namespace\nPID namespaces Yes\nSeccomp-BPF sandbox Yes', { networkInspector, bridgeProbe, maxSessions } = {}) {
  const proxy = createRestrictedProxy({ rawRules: rules, adminToken: proxyToken });
  await proxy.listen({ proxyPort: 0, adminPort: 0, host: '127.0.0.1' });
  const dataRoot = mkdtempSync(join(tmpdir(), 'browser-worker-test-'));
  const driver = makeFakeBrowser(sandbox);
  const worker = new BrowserWorker({
    rules,
    proxyAdminUrl: `http://127.0.0.1:${proxy.admin.address().port}/internal/leases`,
    proxyAdminToken: proxyToken,
    proxyServer: `http://127.0.0.1:${proxy.proxy.address().port}`,
    dataRoot,
    launcher: { async launch(options) { driver.launchOptions = options; return driver.browser; } },
    logger: () => {},
    networkInspector: networkInspector ?? (() => ({ lo: [{ internal: true, address: '127.0.0.1' }] })),
    bridgeGateway: '172.31.240.1',
    sensitivePorts: ['22', '2375', '2376', '22443'],
    bridgeProbe: bridgeProbe ?? (async () => 'ENETUNREACH'),
    ...(maxSessions ? { maxSessions } : {}),
  });
  t.after(async () => { await worker.stop(); proxy.close(); rmSync(dataRoot, { recursive: true, force: true }); });
  return { worker, proxy, driver, dataRoot };
}

test('worker refuses to create a session unless its sandbox probe passes', async (t) => {
  const { worker } = await setup(t, 'Layer 1 Sandbox Namespace No\nPID namespaces Yes\nSeccomp-BPF sandbox Yes');
  await assert.rejects(worker.start(), { code: 'chromium-sandbox-unverified' });
  await assert.rejects(worker.create({ botId: 'bot-a', taskId: 'task-a', allowedOrigins: [origin] }), { code: 'browser-not-ready' });
});

test('worker startup explicitly disables Chromium proxy bypass and keeps sandbox enabled', async (t) => {
  const { worker, driver } = await setup(t);
  await worker.start();
  assert.equal(driver.launchOptions.chromiumSandbox, true);
  assert.ok(driver.launchOptions.args.includes('--proxy-bypass-list=<-loopback>'));
  assert.ok(driver.launchOptions.args.includes('--host-resolver-rules=MAP * ~NOTFOUND'));
  assert.equal(driver.launchOptions.args.some((arg) => arg.includes('no-sandbox')), false);
  assert.equal(Object.hasOwn(driver.launchOptions.env, 'BROWSER_CONTROL_TOKEN'), false);
  assert.equal(Object.hasOwn(driver.launchOptions.env, 'BROWSER_PROXY_ADMIN_TOKEN'), false);
});

test('worker rejects missing PID namespace and seccomp positive rows', async (t) => {
  for (const status of [
    'Layer 1 Sandbox Namespace\nPID namespaces No\nSeccomp-BPF sandbox Yes',
    'Layer 1 Sandbox Namespace\nPID namespaces Yes\nSeccomp-BPF sandbox No',
    'Layer 1 Sandbox Namespace\nSome unrelated row Yes\nSeccomp-BPF sandbox Yes',
  ]) {
    const { worker } = await setup(t, status);
    await assert.rejects(worker.start(), { code: 'chromium-sandbox-unverified' });
  }
  const { worker } = await setup(t, 'Some adjacent row Yes\nLayer 1 Sandbox Namespace\nPID namespaces No\nSeccomp-BPF sandbox Yes');
  await assert.rejects(worker.start(), { code: 'chromium-sandbox-unverified' });
});

test('worker refuses bridge interfaces or a reachable host-sensitive bridge port', async (t) => {
  const withInterface = await setup(t, true, { networkInspector: () => ({ lo: [{ internal: true }], eth0: [{ internal: false, address: '172.31.240.2' }] }) });
  await assert.rejects(withInterface.worker.start(), { code: 'worker-network-not-isolated' });
  const withReachableHost = await setup(t, true, { bridgeProbe: async (_host, port) => port === 22 ? 'connected' : 'ENETUNREACH' });
  await assert.rejects(withReachableHost.worker.start(), { code: 'host-bridge-reachable' });
});

test('worker binds sessions to trusted Bot/task scope and caches idempotent operations', async (t) => {
  const { worker, driver, dataRoot } = await setup(t);
  await worker.start();
  const create = { operationId: randomUUID(), botId: 'bot-a', taskId: 'task-a', allowedOrigins: [origin] };
  const [session, createRetry] = await Promise.all([worker.create(create), worker.create({ ...create, allowedOrigins: [...create.allowedOrigins] })]);
  assert.equal(session.sessionId, createRetry.sessionId);
  assert.equal(session.operationId, create.operationId);
  const op = { botId: 'bot-a', taskId: 'task-a', sequence: 1, operationId: randomUUID(), action: 'navigate', args: { url: `${origin}/` } };
  const first = await worker.operate(session.sessionId, op);
  const retry = await worker.operate(session.sessionId, op);
  assert.deepEqual(retry, first);
  assert.equal(driver.opened.at(-1).page.state.currentUrl, `${origin}/`);
  await assert.rejects(worker.operate(session.sessionId, { ...op, botId: 'bot-b', sequence: 2 }), { code: 'session-scope-denied' });
  await assert.rejects(worker.operate(session.sessionId, { ...op, operationId: randomUUID(), sequence: 3 }), { code: 'operation-sequence-conflict' });
  await assert.rejects(worker.operate(session.sessionId, { ...op, sequence: 2, operationId: randomUUID(), action: 'navigate', args: { url: 'http://169.254.169.254/' } }), { code: 'target-origin-denied' });
  const screenshot = await worker.operate(session.sessionId, { ...op, sequence: 3, operationId: randomUUID(), action: 'screenshot', args: {} });
  assert.equal(screenshot.result.contentType, 'image/png');
  assert.deepEqual(await worker.screenshot(session.sessionId, { botId: 'bot-a', taskId: 'task-a' }, screenshot.result.resourceId), Buffer.from('PNG-fixture-bytes'));
  await worker.cancel(session.sessionId, { botId: 'bot-a', taskId: 'task-a' });
  assert.equal(driver.opened.at(-1).closed, true);
  assert.equal((await worker.close(session.sessionId, { botId: 'bot-a', taskId: 'task-a' })).status, 'cancelled');
  assert.equal(dataRoot.includes('browser-worker-test-'), true);
});

test('closing through an operation remains idempotent after the session is removed', async (t) => {
  const { worker, driver } = await setup(t);
  await worker.start();
  const session = await worker.create({ operationId: randomUUID(), botId: 'bot-close', taskId: 'task-close', allowedOrigins: [origin] });
  const input = { botId: 'bot-close', taskId: 'task-close', sequence: 1, operationId: randomUUID(), action: 'close', args: {} };
  const first = await worker.operate(session.sessionId, input);
  const retry = await worker.operate(session.sessionId, input);
  assert.deepEqual(retry, first);
  assert.equal(driver.opened.at(-1).closed, true);
});

test('operation fingerprints ignore object key order and late results are discarded after cancellation', async (t) => {
  const { worker, driver } = await setup(t);
  await worker.start();
  const session = await worker.create({ operationId: randomUUID(), botId: 'bot-order', taskId: 'task-order', allowedOrigins: [origin] });
  const scroll = { botId: 'bot-order', taskId: 'task-order', sequence: 1, operationId: randomUUID(), action: 'scroll', args: { direction: 'down', pixels: 120 } };
  const result = await worker.operate(session.sessionId, scroll);
  assert.deepEqual(await worker.operate(session.sessionId, { ...scroll, args: { pixels: 120, direction: 'down' } }), result);

  let releaseClick;
  const page = driver.opened.at(-1).page;
  page.locator = () => ({ click: () => new Promise((resolve) => { releaseClick = resolve; }) });
  const late = worker.operate(session.sessionId, { ...scroll, sequence: 2, operationId: randomUUID(), action: 'click', args: { selector: '#increment' } });
  await new Promise((resolve) => setImmediate(resolve));
  await worker.cancel(session.sessionId, { botId: 'bot-order', taskId: 'task-order' });
  releaseClick();
  await assert.rejects(late, { code: 'session-terminated' });
});

test('worker reserves concurrent creates and rejects idempotency key parameter conflicts', async (t) => {
  const { worker } = await setup(t, undefined, { maxSessions: 1 });
  await worker.start();
  const first = { operationId: randomUUID(), botId: 'bot-one', taskId: 'task-one', allowedOrigins: [origin] };
  const pending = worker.create(first);
  await assert.rejects(worker.create({ operationId: randomUUID(), botId: 'bot-two', taskId: 'task-two', allowedOrigins: [origin] }), { code: 'session-limit' });
  const created = await pending;
  await assert.rejects(worker.create({ ...first, taskId: 'different-task' }), { code: 'operation-id-conflict' });
  await worker.close(created.sessionId, { botId: first.botId, taskId: first.taskId });
});

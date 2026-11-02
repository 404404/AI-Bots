import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { rmSync, mkdtempSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { createRestrictedProxy } from '../src/proxy.mjs';
import { BrowserWorker, readCgroupResourceStatus } from '../src/worker.mjs';

const origin = 'http://fixture.test:8081';
const secureOrigin = 'https://fixture.test:8443';
const rules = {
  [origin]: { addresses: ['172.31.240.10'], allowPrivate: true },
  [secureOrigin]: { addresses: ['172.31.240.10'], allowPrivate: true },
};
const proxyToken = 'proxy-internal-test-token-is-not-a-real-secret-0001';

async function availablePort() {
  const server = createServer();
  await new Promise((resolve, reject) => server.once('error', reject).listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));
  return port;
}

function makeFakeBrowser(sandbox = 'Layer 1 Sandbox Namespace\nPID namespaces Yes\nSeccomp-BPF sandbox Yes') {
  const opened = [];
  const cdpState = { unavailable: false };
  const browser = {
    async newContext() {
      const context = {
        routes: [],
        cdpCommands: [],
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
        async route(pattern, handler) { context.routes.push([pattern, handler]); },
        async routeWebSocket(pattern, handler) { context.websocketHandler = handler; },
        async newCDPSession() {
          if (cdpState.unavailable) throw new Error('CDP unavailable');
          return { async send(method, params) { context.cdpCommands.push({ method, params }); }, async detach() {} };
        },
        on() {},
      };
      return context;
    },
    async close() { browser.closed = true; },
  };
  return { browser, opened, cdpState };
}

async function setup(t, sandbox = 'Layer 1 Sandbox Namespace\nPID namespaces Yes\nSeccomp-BPF sandbox Yes', { networkInspector, bridgeProbe, maxSessions, queryPolicy, proxyServer, proxySocket = true, loopbackProxyPort, logger = () => {}, sessionCreateTimeoutMs, sessionCleanupTimeoutMs } = {}) {
  const proxy = createRestrictedProxy({ rawRules: rules, adminToken: proxyToken });
  const dataRoot = mkdtempSync(join(tmpdir(), 'browser-worker-test-'));
  const relayPort = loopbackProxyPort ?? await availablePort();
  const privateProxySocket = join(dataRoot, 'proxy.sock');
  const privateAdminSocket = join(dataRoot, 'proxy-admin.sock');
  await proxy.listenUnix({ proxySocketPath: privateProxySocket, adminSocketPath: privateAdminSocket });
  const driver = makeFakeBrowser(sandbox);
  const worker = new BrowserWorker({
    rules,
    proxyAdminSocket: privateAdminSocket,
    proxyAdminToken: proxyToken,
    proxyServer: proxyServer ?? `http://127.0.0.1:${relayPort}`,
    proxySocket: proxySocket ? privateProxySocket : undefined,
    loopbackProxyPort: relayPort,
    dataRoot,
    launcher: { async launch(options) { driver.launchOptions = options; return driver.browser; } },
    logger,
    networkInspector: networkInspector ?? (() => ({ lo: [{ internal: true, address: '127.0.0.1' }] })),
    bridgeGateway: '172.31.240.1',
    sensitivePorts: ['22', '2375', '2376', '22443'],
    bridgeProbe: bridgeProbe ?? (async () => 'ENETUNREACH'),
    ...(queryPolicy ? { queryPolicy } : {}),
    ...(maxSessions ? { maxSessions } : {}),
    ...(sessionCreateTimeoutMs ? { sessionCreateTimeoutMs } : {}),
    ...(sessionCleanupTimeoutMs ? { sessionCleanupTimeoutMs } : {}),
  });
  t.after(async () => { await worker.stop(); proxy.close(); rmSync(dataRoot, { recursive: true, force: true }); });
  return { worker, proxy, driver, dataRoot };
}

test('cgroup resource diagnostics parse only bounded numeric counters and max markers', () => {
  const values = new Map([
    ['/sys/fs/cgroup/pids.current', '127\n'],
    ['/sys/fs/cgroup/pids.max', '128\n'],
    ['/sys/fs/cgroup/pids.events', 'max 4\n'],
    ['/sys/fs/cgroup/memory.current', '1048576\n'],
    ['/sys/fs/cgroup/memory.max', 'max\n'],
  ]);
  assert.deepEqual(readCgroupResourceStatus((path) => values.get(path) ?? ''), {
    pidsCurrent: 127, pidsMax: 128, pidsMaxEvents: 4, memoryCurrent: 1048576, memoryMax: 'max',
  });
  assert.deepEqual(readCgroupResourceStatus((path) => path.includes('events') ? 'max not-a-number' : 'secret-path /proc/cmdline'), {
    pidsCurrent: null, pidsMax: null, pidsMaxEvents: null, memoryCurrent: null, memoryMax: null,
  });
});

test('worker refuses to create a session unless its sandbox probe passes', async (t) => {
  const { worker } = await setup(t, 'Layer 1 Sandbox Namespace No\nPID namespaces Yes\nSeccomp-BPF sandbox Yes');
  await assert.rejects(worker.start(), { code: 'chromium-sandbox-unverified' });
  await assert.rejects(worker.create({ botId: 'bot-a', taskId: 'task-a', allowedOrigins: [origin] }), { code: 'browser-not-ready' });
});

test('worker sandbox probe logs only a safe failure stage and error-name enum', async (t) => {
  const logs = [];
  const { worker, driver } = await setup(t, undefined, { logger: (entry) => logs.push(entry) });
  driver.browser.newContext = async () => {
    const error = new Error('unsafe page text /secret/token');
    error.name = 'CredentialError';
    throw error;
  };

  await assert.rejects(worker.start(), { code: 'chromium-sandbox-unverified' });
  const probeFailure = logs.find((entry) => entry.event === 'chromium-sandbox-probe-failed');
  assert.deepEqual(probeFailure, {
    event: 'chromium-sandbox-probe-failed', stage: 'context-create', errorName: 'Other', at: probeFailure.at,
  });
  assert.equal(JSON.stringify(logs).includes('unsafe page text'), false);
  assert.equal(JSON.stringify(logs).includes('/secret/token'), false);
});

test('worker keeps sandbox verification closed when navigation fails', async (t) => {
  const logs = [];
  const { worker, driver } = await setup(t, undefined, { logger: (entry) => logs.push(entry) });
  const newContext = driver.browser.newContext.bind(driver.browser);
  driver.browser.newContext = async (...args) => {
    const context = await newContext(...args);
    const newPage = context.newPage.bind(context);
    context.newPage = async () => {
      const page = await newPage();
      page.goto = async () => { throw Object.assign(new Error('chrome://sandbox /sensitive'), { name: 'TimeoutError' }); };
      return page;
    };
    return context;
  };

  await assert.rejects(worker.start(), { code: 'chromium-sandbox-unverified' });
  assert.ok(logs.some((entry) => entry.event === 'chromium-sandbox-probe-failed'
    && entry.stage === 'navigation' && entry.errorName === 'TimeoutError'));
  assert.equal(JSON.stringify(logs).includes('chrome://sandbox'), false);
  assert.equal(JSON.stringify(logs).includes('/sensitive'), false);
});

test('worker startup explicitly disables Chromium proxy bypass and keeps sandbox enabled', async (t) => {
  const logs = [];
  const { worker, driver } = await setup(t, undefined, { logger: (entry) => logs.push(entry) });
  await worker.start();
  assert.equal(driver.launchOptions.chromiumSandbox, true);
  if (process.env.CHROMIUM_PATH) assert.equal(driver.launchOptions.executablePath, process.env.CHROMIUM_PATH);
  else assert.equal(driver.launchOptions.channel, 'chromium', 'use full Chromium headless instead of Playwright headless shell');
  assert.ok(driver.launchOptions.args.includes('--proxy-bypass-list=<-loopback>'));
  assert.ok(driver.launchOptions.args.includes('--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1'));
  assert.equal(driver.launchOptions.proxy.server.startsWith('http://127.0.0.1:'), true);
  assert.equal(driver.launchOptions.args.some((arg) => arg.includes('no-sandbox')), false);
  assert.equal(Object.hasOwn(driver.launchOptions.env, 'BROWSER_CONTROL_TOKEN'), false);
  assert.equal(Object.hasOwn(driver.launchOptions.env, 'BROWSER_PROXY_ADMIN_TOKEN'), false);
  const sandboxLog = logs.find((entry) => entry.event === 'chromium-sandbox-status');
  assert.deepEqual(sandboxLog, { event: 'chromium-sandbox-status', layerOneNamespace: true, pidNamespaces: true, seccompBpf: true, at: sandboxLog.at });
  assert.equal(JSON.stringify(logs).includes('Layer 1 Sandbox'), false);
});

test('worker rejects proxy endpoints outside its fixed loopback relay before launching Chromium', async (t) => {
  const { worker } = await setup(t, undefined, { proxyServer: 'http://proxy.internal:8080' });
  await assert.rejects(worker.start(), { code: 'invalid-proxy-endpoint' });
});

test('worker requires its private proxy socket and rejects a proxy URL port different from the relay listener', async (t) => {
  const missingSocket = await setup(t, undefined, { proxySocket: false });
  await assert.rejects(missingSocket.worker.start(), { code: 'proxy-socket-required' });

  const portMismatch = await setup(t, undefined, { proxyServer: 'http://127.0.0.1:20001', loopbackProxyPort: 20000 });
  await assert.rejects(portMismatch.worker.start(), { code: 'invalid-proxy-endpoint' });
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

test('trusted deny query policy blocks navigations and each routed request before continue', async (t) => {
  const { worker, proxy, driver } = await setup(t, undefined, { queryPolicy: 'deny' });
  const ready = await worker.start();
  assert.deepEqual(ready.capabilities, { version: 1, queryPolicy: 'deny' });
  const session = await worker.create({ operationId: randomUUID(), botId: 'bot-policy', taskId: 'task-policy', allowedOrigins: [origin], queryPolicy: 'allow', requiredPolicy: { version: 1, queryPolicy: 'deny' } });
  assert.deepEqual(session.enforcedPolicy, { version: 1, queryPolicy: 'deny' });
  assert.equal(proxy.leases.get(session.sessionId)?.queryPolicy, 'deny', 'worker trusted policy must be bound into the proxy lease');
  await assert.rejects(worker.operate(session.sessionId, { botId: 'bot-policy', taskId: 'task-policy', requiredPolicy: { version: 1, queryPolicy: 'allow' } }), { code: 'required-policy-unmet' });
  await assert.rejects(worker.operate(session.sessionId, {
    botId: 'bot-policy', taskId: 'task-policy', sequence: 1, operationId: randomUUID(), action: 'navigate', args: { url: 'http://169.254.169.254/latest/meta-data/' },
  }), { code: 'required-policy-unmet' });
  const op = { botId: 'bot-policy', taskId: 'task-policy', requiredPolicy: { version: 1, queryPolicy: 'deny' }, sequence: 1, operationId: randomUUID(), action: 'navigate', args: { url: `${origin}/page?secret=value` } };
  await assert.rejects(worker.operate(session.sessionId, op), { code: 'target-query-denied' });
  await assert.rejects(worker.operate(session.sessionId, { ...op, sequence: 2, operationId: randomUUID(), args: { url: `${origin}/page?` } }), { code: 'target-query-denied' });
  assert.equal(driver.opened.at(-1).page.state.currentUrl, 'about:blank');

  const context = driver.opened.at(-1);
  assert.deepEqual(context.cdpCommands, [
    { method: 'Network.enable', params: undefined },
    { method: 'Network.setBlockedURLs', params: { urls: ['*?*'] } },
  ]);
  const routeHandler = context.routes.find(([pattern]) => pattern === '**/*')[1];
  for (const url of [`${origin}/redirected?secret=value`, `${origin}/resource?secret=value`, `${origin}/trailing?`, 'https://user:pass@fixture.test:8081/']) {
    let continued = false;
    let aborted = false;
    await routeHandler({
      request: () => ({ url: () => url }),
      async continue() { continued = true; },
      async abort() { aborted = true; },
    });
    assert.equal(continued, false, `${url} must never be sent`);
    assert.equal(aborted, true, `${url} must be blocked before sending`);
  }

  context.page.goto = async () => { context.page.state.currentUrl = `${origin}/redirected?secret=value`; };
  await assert.rejects(worker.operate(session.sessionId, {
    botId: 'bot-policy', taskId: 'task-policy', requiredPolicy: { version: 1, queryPolicy: 'deny' }, sequence: 3,
    operationId: randomUUID(), action: 'navigate', args: { url: `${origin}/redirected` },
  }), { code: 'target-query-denied' });
});

test('navigation timeout errors preserve a specific code for the real E2E gate', async (t) => {
  const { worker, driver } = await setup(t, undefined, { queryPolicy: 'deny' });
  await worker.start();
  const session = await worker.create({
    operationId: randomUUID(), botId: 'timeout-code-bot', taskId: 'timeout-code-task', allowedOrigins: [origin], requiredPolicy: { version: 1, queryPolicy: 'deny' },
  });
  driver.opened.at(-1).page.goto = async () => {
    const error = new Error('navigation timed out');
    error.name = 'TimeoutError';
    throw error;
  };
  await assert.rejects(worker.operate(session.sessionId, {
    botId: 'timeout-code-bot', taskId: 'timeout-code-task', requiredPolicy: { version: 1, queryPolicy: 'deny' },
    sequence: 1, operationId: randomUUID(), action: 'navigate', args: { url: `${origin}/slow` },
  }), { code: 'navigation-timeout', status: 504 });
});

test('strict query sessions fail closed when HTTPS or the Chromium network query guard is unavailable', async (t) => {
  const httpsSetup = await setup(t, undefined, { queryPolicy: 'deny' });
  await httpsSetup.worker.start();
  await assert.rejects(httpsSetup.worker.create({
    operationId: randomUUID(), botId: 'https-policy', taskId: 'https-policy-task', allowedOrigins: [secureOrigin], requiredPolicy: { version: 1, queryPolicy: 'deny' },
  }), { code: 'strict-https-denied' });
  assert.equal(httpsSetup.worker.sessions.size, 0);

  const noCdp = await setup(t, undefined, { queryPolicy: 'deny' });
  await noCdp.worker.start();
  noCdp.driver.cdpState.unavailable = true;
  await assert.rejects(noCdp.worker.create({
    operationId: randomUUID(), botId: 'cdp-policy', taskId: 'cdp-policy-task', allowedOrigins: [origin], requiredPolicy: { version: 1, queryPolicy: 'deny' },
  }), { code: 'query-guard-unavailable' });
  assert.equal(noCdp.worker.sessions.size, 0);
});

test('worker closes a strict session and creates the next one through the same browser process', async (t) => {
  const logs = [];
  const { worker, proxy } = await setup(t, undefined, { queryPolicy: 'deny', logger: (entry) => logs.push(entry) });
  await worker.start();
  const first = await worker.create({
    operationId: randomUUID(), botId: 'repeat-bot-a', taskId: 'repeat-task-a', allowedOrigins: [origin], requiredPolicy: { version: 1, queryPolicy: 'deny' },
  });
  assert.equal(proxy.leases.get(first.sessionId)?.queryPolicy, 'deny');
  await worker.close(first.sessionId, { botId: 'repeat-bot-a', taskId: 'repeat-task-a', requiredPolicy: { version: 1, queryPolicy: 'deny' } });
  assert.equal(proxy.leases.has(first.sessionId), false);
  const second = await worker.create({
    operationId: randomUUID(), botId: 'repeat-bot-b', taskId: 'repeat-task-b', allowedOrigins: [origin], requiredPolicy: { version: 1, queryPolicy: 'deny' },
  });
  assert.equal(proxy.leases.get(second.sessionId)?.queryPolicy, 'deny');
  assert.equal(worker.sessions.size, 1);
  const stages = logs.filter((entry) => entry.event === 'browser-session-stage');
  assert.ok(stages.some((entry) => entry.phase === 'session-close-context' && entry.outcome === 'completed'));
  assert.ok(stages.some((entry) => entry.phase === 'session-close-proxy-lease' && entry.outcome === 'completed'));
  assert.ok(stages.some((entry) => entry.phase === 'context-create' && entry.outcome === 'completed'));
  assert.ok(stages.every((entry) => Number.isSafeInteger(entry.at) && (!('durationMs' in entry) || (entry.durationMs >= 0 && entry.durationMs <= 120_000))));
  assert.equal(JSON.stringify(stages).includes(first.sessionId), false);
  assert.equal(JSON.stringify(stages).includes('fixture.test'), false);
});

test('session-stage diagnostics expose only a fixed phase and safe error-name enum on setup failure', async (t) => {
  const logs = [];
  const { worker, driver } = await setup(t, undefined, { queryPolicy: 'deny', logger: (entry) => logs.push(entry) });
  await worker.start();
  driver.browser.newContext = async () => { throw new Error('https://private.test/path?token=do-not-log'); };
  await assert.rejects(worker.create({
    operationId: randomUUID(), botId: 'diagnostic-bot', taskId: 'diagnostic-task', allowedOrigins: [origin], requiredPolicy: { version: 1, queryPolicy: 'deny' },
  }), /do-not-log/u);
  const failed = logs.find((entry) => entry.event === 'browser-session-stage' && entry.phase === 'context-create' && entry.outcome === 'failed');
  assert.equal(failed?.errorName, 'Error');
  const serialized = JSON.stringify(logs);
  for (const secret of ['private.test', 'token=do-not-log', 'https://']) assert.equal(serialized.includes(secret), false);
});

test('a hung page creation and context cleanup are bounded and retain proxy revocation', async (t) => {
  const logs = [];
  const { worker, proxy, driver } = await setup(t, undefined, {
    queryPolicy: 'deny', logger: (entry) => logs.push(entry), sessionCreateTimeoutMs: 80, sessionCleanupTimeoutMs: 20,
  });
  await worker.start();
  let latePageClosed = false;
  const newContext = driver.browser.newContext.bind(driver.browser);
  driver.browser.newContext = async (...args) => {
    const context = await newContext(...args);
    context.newPage = () => new Promise((resolve) => setTimeout(() => resolve({ async close() { latePageClosed = true; } }), 120));
    context.close = () => new Promise(() => {});
    return context;
  };
  const started = Date.now();
  await assert.rejects(worker.create({
    operationId: randomUUID(), botId: 'page-timeout-bot', taskId: 'page-timeout-task', allowedOrigins: [origin], requiredPolicy: { version: 1, queryPolicy: 'deny' },
  }), { code: 'session-stage-timeout' });
  assert.ok(Date.now() - started < 1000, 'create and cleanup must finish well before the gateway timeout');
  assert.equal(proxy.leases.size, 0, 'proxy lease revocation must still be attempted after context cleanup times out');
  assert.ok(logs.some((entry) => entry.event === 'browser-session-stage' && entry.phase === 'page-create' && entry.outcome === 'failed'));
  assert.ok(logs.some((entry) => entry.event === 'browser-session-stage' && entry.phase === 'session-close-context' && entry.outcome === 'failed'));
  assert.ok(logs.some((entry) => entry.event === 'browser-session-stage' && entry.phase === 'session-close-proxy-lease' && entry.outcome === 'completed'));
  assert.equal(worker.degraded, true, 'a context that could not be closed must prevent further session creation');
  await assert.rejects(worker.create({
    operationId: randomUUID(), botId: 'page-timeout-next', taskId: 'page-timeout-next-task', allowedOrigins: [origin], requiredPolicy: { version: 1, queryPolicy: 'deny' },
  }), { code: 'browser-not-ready' });
  const resourceSnapshots = logs.filter((entry) => entry.event === 'browser-session-resources');
  assert.ok(resourceSnapshots.some((entry) => entry.point === 'before' && entry.attempts === 1 && entry.failures === 0));
  assert.ok(resourceSnapshots.some((entry) => entry.point === 'failed' && entry.attempts === 1 && entry.failures === 1));
  assert.ok(resourceSnapshots.every((entry) => ['number', 'string'].includes(typeof entry.pidsCurrent) || entry.pidsCurrent === null));
  await new Promise((resolve) => setTimeout(resolve, 80));
  assert.equal(latePageClosed, true, 'a page delivered after the deadline must be closed');
  assert.equal(JSON.stringify(logs).includes('page-timeout-task'), false);
  assert.equal(JSON.stringify(logs).includes('fixture.test'), false);
});

test('a late successful proxy lease registration is revoked after create timeout', async (t) => {
  const logs = [];
  const { worker, proxy } = await setup(t, undefined, {
    queryPolicy: 'deny', logger: (entry) => logs.push(entry), sessionCreateTimeoutMs: 40, sessionCleanupTimeoutMs: 100,
  });
  await worker.start();
  const register = worker.updateProxyLease.bind(worker);
  let releaseRegistration;
  let registrationStarted;
  const started = new Promise((resolve) => { registrationStarted = resolve; });
  const delayedRegistration = new Promise((resolve) => { releaseRegistration = resolve; });
  worker.updateProxyLease = async (input) => {
    if (input.close) return register(input);
    registrationStarted();
    await delayedRegistration;
    return register(input);
  };
  const create = worker.create({
    operationId: randomUUID(), botId: 'late-lease-bot', taskId: 'late-lease-task', allowedOrigins: [origin], requiredPolicy: { version: 1, queryPolicy: 'deny' },
  });
  await started;
  await assert.rejects(create, { code: 'session-stage-timeout' });
  releaseRegistration();
  for (let attempt = 0; attempt < 50 && proxy.leases.size !== 0; attempt += 1) await new Promise((resolve) => setTimeout(resolve, 5));
  // Registration may not have reached the proxy yet; wait for the late-result cleanup event.
  for (let attempt = 0; attempt < 50 && !logs.some((entry) => entry.event === 'browser-session-stage' && entry.phase === 'late-result-cleanup' && entry.outcome === 'completed'); attempt += 1) await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(proxy.leases.size, 0, 'a successful registration delivered after timeout must be revoked');
  assert.ok(logs.some((entry) => entry.event === 'browser-session-stage' && entry.phase === 'late-result-cleanup' && entry.outcome === 'completed'));
  assert.equal(worker.sessions.size, 0);
});

test('a late context that cannot be closed degrades the worker', async (t) => {
  const logs = [];
  const { worker, driver } = await setup(t, undefined, {
    queryPolicy: 'deny', logger: (entry) => logs.push(entry), sessionCreateTimeoutMs: 40, sessionCleanupTimeoutMs: 100,
  });
  await worker.start();
  let releaseContext;
  let contextCreateStarted;
  const started = new Promise((resolve) => { contextCreateStarted = resolve; });
  const delayedContext = new Promise((resolve) => { releaseContext = resolve; });
  driver.browser.newContext = () => { contextCreateStarted(); return delayedContext; };
  await assert.rejects(worker.create({
    operationId: randomUUID(), botId: 'late-context-bot', taskId: 'late-context-task', allowedOrigins: [origin], requiredPolicy: { version: 1, queryPolicy: 'deny' },
  }), { code: 'session-stage-timeout' });
  await started;
  releaseContext({ async close() { throw new Error('late context close detail'); } });
  for (let attempt = 0; attempt < 50 && !logs.some((entry) => entry.event === 'browser-session-stage' && entry.phase === 'late-result-cleanup'); attempt += 1) await new Promise((resolve) => setTimeout(resolve, 5));
  const cleanup = logs.find((entry) => entry.event === 'browser-session-stage' && entry.phase === 'late-result-cleanup' && entry.outcome === 'failed');
  assert.ok(cleanup);
  assert.equal(cleanup?.errorName, 'Error');
  assert.equal(worker.degraded, true);
  assert.equal(JSON.stringify(logs).includes('late context close detail'), false);
});

test('an in-flight create rolls back if another create degrades the worker before activation', async (t) => {
  const { worker, proxy, driver } = await setup(t, undefined, { queryPolicy: 'deny' });
  await worker.start();
  const newContext = driver.browser.newContext.bind(driver.browser);
  let firstPageStarted;
  const firstStarted = new Promise((resolve) => { firstPageStarted = resolve; });
  let releaseFirstPage;
  const firstPage = new Promise((resolve) => { releaseFirstPage = resolve; });
  let contexts = 0;
  driver.browser.newContext = async (...args) => {
    const context = await newContext(...args);
    contexts += 1;
    if (contexts === 1) {
      context.newPage = () => { firstPageStarted(); return firstPage; };
    } else {
      context.newPage = async () => { throw new Error('controlled page-create failure'); };
      context.close = async () => { throw new Error('controlled cleanup failure'); };
    }
    return context;
  };
  const firstCreate = worker.create({
    operationId: randomUUID(), botId: 'concurrent-good', taskId: 'concurrent-good-task', allowedOrigins: [origin], requiredPolicy: { version: 1, queryPolicy: 'deny' },
  });
  await firstStarted;
  await assert.rejects(worker.create({
    operationId: randomUUID(), botId: 'concurrent-failing', taskId: 'concurrent-failing-task', allowedOrigins: [origin], requiredPolicy: { version: 1, queryPolicy: 'deny' },
  }));
  assert.equal(worker.degraded, true);
  releaseFirstPage({ async close() {} });
  await assert.rejects(firstCreate, { code: 'browser-not-ready' });
  assert.equal(worker.sessions.size, 0, 'a create completing after degradation must never activate');
  assert.equal(proxy.leases.size, 0, 'both failed creates must revoke their leases');
});

test('asynchronous request route installation failure rejects session creation', async (t) => {
  const logs = [];
  const { worker, proxy, driver } = await setup(t, undefined, { queryPolicy: 'deny', logger: (entry) => logs.push(entry) });
  await worker.start();
  const newContext = driver.browser.newContext.bind(driver.browser);
  driver.browser.newContext = async (...args) => {
    const context = await newContext(...args);
    context.route = async () => { throw new Error('route install failure contains secret text'); };
    return context;
  };
  await assert.rejects(worker.create({
    operationId: randomUUID(), botId: 'route-failure-bot', taskId: 'route-failure-task', allowedOrigins: [origin], requiredPolicy: { version: 1, queryPolicy: 'deny' },
  }), /route install failure/u);
  assert.ok(logs.some((entry) => entry.event === 'browser-session-stage' && entry.phase === 'request-routes-install' && entry.outcome === 'failed'));
  assert.ok(logs.some((entry) => entry.event === 'browser-session-stage' && entry.phase === 'session-close-proxy-lease' && entry.outcome === 'completed'));
  assert.equal(JSON.stringify(logs).includes('secret text'), false);
  assert.equal(proxy.leases.size, 0);
});

test('query guard failure uses bounded outer cleanup and revokes the lease before CDP detach', async (t) => {
  const logs = [];
  const { worker, proxy, driver } = await setup(t, undefined, {
    queryPolicy: 'deny', logger: (entry) => logs.push(entry), sessionCleanupTimeoutMs: 20,
  });
  await worker.start();
  const newContext = driver.browser.newContext.bind(driver.browser);
  driver.browser.newContext = async (...args) => {
    const context = await newContext(...args);
    context.newCDPSession = async () => ({
      async send() { throw new Error('CDP command failure'); },
      async detach() { return new Promise(() => {}); },
    });
    return context;
  };
  const started = Date.now();
  await assert.rejects(worker.create({
    operationId: randomUUID(), botId: 'query-guard-cleanup-bot', taskId: 'query-guard-cleanup-task', allowedOrigins: [origin], requiredPolicy: { version: 1, queryPolicy: 'deny' },
  }), { code: 'query-guard-unavailable' });
  assert.ok(Date.now() - started < 1000, 'failed query guard cleanup must remain bounded');
  assert.equal(proxy.leases.size, 0);
  const stages = logs.filter((entry) => entry.event === 'browser-session-stage');
  const leaseRevoke = stages.findIndex((entry) => entry.phase === 'session-close-proxy-lease' && entry.outcome === 'completed');
  const detachStart = stages.findIndex((entry) => entry.phase === 'session-close-query-guard' && entry.outcome === 'started');
  assert.ok(leaseRevoke >= 0 && detachStart > leaseRevoke, 'proxy lease must be revoked before the bounded CDP detach attempt');
  assert.ok(stages.some((entry) => entry.phase === 'session-close-query-guard' && entry.outcome === 'failed'));
  assert.ok(stages.some((entry) => entry.phase === 'session-close-context' && entry.outcome === 'completed'));
  assert.equal(worker.degraded, true);
});

test('cleanup stage failures are logged as failed while later cleanup stages continue', async (t) => {
  const logs = [];
  const { worker, proxy, driver } = await setup(t, undefined, { queryPolicy: 'deny', logger: (entry) => logs.push(entry) });
  await worker.start();
  const newContext = driver.browser.newContext.bind(driver.browser);
  driver.browser.newContext = async (...args) => {
    const context = await newContext(...args);
    context.close = async () => { throw new Error('sensitive context close detail'); };
    const newCDPSession = context.newCDPSession.bind(context);
    context.newCDPSession = async (...sessionArgs) => {
      const cdp = await newCDPSession(...sessionArgs);
      cdp.detach = async () => { throw new Error('sensitive CDP detach detail'); };
      return cdp;
    };
    return context;
  };
  const session = await worker.create({
    operationId: randomUUID(), botId: 'cleanup-failure-bot', taskId: 'cleanup-failure-task', allowedOrigins: [origin], requiredPolicy: { version: 1, queryPolicy: 'deny' },
  });
  await assert.rejects(worker.close(session.sessionId, { botId: 'cleanup-failure-bot', taskId: 'cleanup-failure-task', requiredPolicy: { version: 1, queryPolicy: 'deny' } }), { code: 'session-cleanup-incomplete' });
  const stages = logs.filter((entry) => entry.event === 'browser-session-stage');
  assert.ok(stages.some((entry) => entry.phase === 'session-close-query-guard' && entry.outcome === 'failed'));
  assert.ok(stages.some((entry) => entry.phase === 'session-close-context' && entry.outcome === 'failed'));
  assert.ok(stages.some((entry) => entry.phase === 'session-close-proxy-lease' && entry.outcome === 'completed'));
  assert.equal(proxy.leases.has(session.sessionId), false);
  assert.equal(worker.degraded, true);
  assert.equal(JSON.stringify(stages).includes('sensitive'), false);
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

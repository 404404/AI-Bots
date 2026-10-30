import { createServer, request as httpRequest } from 'node:http';
import { connect as tcpConnect, isIP } from 'node:net';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { chmodSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';
import { parseTargetRules, canonicalTarget } from './policy.mjs';
import { BrowserError, requireValue } from './errors.mjs';

const MAX_BODY = 128 * 1024;
const MAX_TEXT = 16 * 1024;
const MAX_SCREENSHOT_BYTES = 8 * 1024 * 1024;
const MAX_STEPS = 12;
const MAX_SESSIONS = 4;
const MAX_LEASE_MS = 120_000;
const OP_TIMEOUT_MS = 15_000;
const MAX_RELAY_TUNNEL_MS = 30_000;
const MAX_RELAY_TUNNEL_BYTES = 16 * 1024 * 1024;

function safeJson(res, status, value, headers = {}) {
  const bytes = Buffer.from(JSON.stringify(value));
  res.writeHead(status, { 'content-type': 'application/json', 'content-length': bytes.length, 'cache-control': 'no-store', ...headers });
  res.end(bytes);
}

async function readJson(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    requireValue(size <= MAX_BODY, 'request-too-large', '请求体超过限制。', 413);
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new BrowserError('invalid-json', '请求 JSON 无效。'); }
}

function simpleId(value, name) {
  requireValue(typeof value === 'string' && value.length > 0 && value.length <= 80 && /^[A-Za-z0-9][A-Za-z0-9._:-]*$/u.test(value), 'invalid-scope', `${name} 无效。`);
  return value;
}

function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
}

function stableFingerprint(value) {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}

async function proxyAdmin({ url, socketPath, token }, body) {
  const path = body.close ? `/internal/leases/${body.sessionId}/close` : '/internal/leases';
  const payload = Buffer.from(JSON.stringify(body));
  const status = await new Promise((resolveStatus, reject) => {
    const headers = { 'content-type': 'application/json', 'content-length': payload.length, 'x-proxy-admin-token': token };
    let options;
    if (socketPath) options = { socketPath, path, method: 'POST', headers, timeout: 3000 };
    else {
      const target = new URL(body.close ? `${url.replace(/\/$/u, '')}/${body.sessionId}/close` : url);
      options = { protocol: target.protocol, hostname: target.hostname, port: target.port, path: `${target.pathname}${target.search}`, method: 'POST', headers, timeout: 3000 };
    }
    const req = httpRequest(options, (res) => { res.resume(); res.on('end', () => resolveStatus(res.statusCode ?? 500)); });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('proxy control timeout')));
    req.end(payload);
  });
  if (status < 200 || status >= 300) throw new BrowserError('proxy-lease-failed', '受限出口租约更新失败。', 503);
}

export function createLoopbackProxyRelay(proxySocketPath, logger = () => {}) {
  const server = createServer((req, res) => {
    const upstream = httpRequest({ socketPath: proxySocketPath, path: req.url, method: req.method, headers: req.headers, timeout: 15_000, agent: false }, (response) => {
      res.writeHead(response.statusCode ?? 502, response.headers);
      response.pipe(res);
    });
    upstream.on('error', () => { if (!res.headersSent) res.writeHead(502); res.end(); });
    upstream.on('timeout', () => upstream.destroy(new Error('proxy relay timeout')));
    const abort = () => { if (!res.writableEnded) upstream.destroy(); };
    req.once('aborted', abort);
    res.once('close', abort);
    req.pipe(upstream);
  });
  server.on('connect', (req, client, head) => {
    const upstream = httpRequest({ socketPath: proxySocketPath, method: 'CONNECT', path: req.url, headers: req.headers, timeout: 15_000, agent: false });
    let established = false;
    let closed = false;
    let cleanupLogged = false;
    let tunnelSocket;
    let proxySocket;
    let transferred = 0;
    let handshakeTimer, tunnelTimer;
    const logCleanup = () => {
      if (cleanupLogged || !proxySocket) return;
      cleanupLogged = true;
      logger({ event: 'relay-cleanup', upstreamSocketDestroyed: proxySocket.destroyed });
    };
    const cleanup = () => {
      closed = true;
      clearTimeout(handshakeTimer);
      clearTimeout(tunnelTimer);
      upstream.destroy();
      proxySocket?.destroy();
      upstream.socket?.destroy();
      tunnelSocket?.destroy();
      if (!client.destroyed) client.destroy();
      logCleanup();
    };
    upstream.once('socket', (socket) => {
      proxySocket = socket;
      socket.once('close', () => { if (!established) cleanup(); });
      if (closed) { socket.destroy(); logCleanup(); }
    });
    upstream.on('connect', (response, socket, upstreamHead) => {
      if (client.destroyed) { socket.destroy(); cleanup(); return; }
      established = true;
      tunnelSocket = socket;
      clearTimeout(handshakeTimer);
      tunnelTimer = setTimeout(cleanup, MAX_RELAY_TUNNEL_MS);
      const headers = response.rawHeaders;
      client.write(`HTTP/1.1 ${response.statusCode ?? 502} ${response.statusMessage ?? 'Proxy Response'}\r\n`);
      for (let i = 0; i < headers.length; i += 2) client.write(`${headers[i]}: ${headers[i + 1]}\r\n`);
      client.write('\r\n');
      if (head.length) socket.write(head);
      if (upstreamHead?.length) client.write(upstreamHead);
      const count = (chunk) => { transferred += chunk.length; if (transferred > MAX_RELAY_TUNNEL_BYTES) cleanup(); };
      client.on('data', count);
      socket.on('data', count);
      socket.pipe(client);
      client.pipe(socket);
      socket.once('close', cleanup);
    });
    upstream.on('response', (response) => {
      established = true;
      clearTimeout(handshakeTimer);
      client.write(`HTTP/1.1 ${response.statusCode ?? 502} ${response.statusMessage ?? 'Proxy Response'}\r\n`);
      for (let i = 0; i < response.rawHeaders.length; i += 2) client.write(`${response.rawHeaders[i]}: ${response.rawHeaders[i + 1]}\r\n`);
      client.end('\r\n');
      response.resume();
      upstream.destroy();
    });
    upstream.on('error', () => {
      if (!client.destroyed && !established) {
        established = true;
        clearTimeout(handshakeTimer);
        client.end('HTTP/1.1 502 Proxy Relay Failed\r\nConnection: close\r\n\r\n');
      }
      upstream.destroy();
    });
    req.once('aborted', cleanup);
    client.once('close', cleanup);
    client.once('end', cleanup);
    client.once('error', cleanup);
    handshakeTimer = setTimeout(() => {
      if (!client.destroyed && !established) {
        established = true;
        client.end('HTTP/1.1 504 Proxy Relay Timeout\r\nConnection: close\r\n\r\n');
      }
      upstream.destroy();
    }, 15_000);
    upstream.end();
  });
  server.on('upgrade', (_req, socket) => socket.end('HTTP/1.1 403 WebSocket Disabled\r\nConnection: close\r\n\r\n'));
  return server;
}

export class BrowserWorker {
  constructor({ rules, proxyAdminUrl, proxyAdminSocket, proxyAdminToken, proxySocket, proxyServer, dataRoot, launcher = chromium, now = () => Date.now(), logger = () => {}, maxSessions = MAX_SESSIONS, networkInspector = networkInterfaces, bridgeGateway = process.env.BROWSER_BRIDGE_GATEWAY, sensitivePorts = process.env.BROWSER_HOST_SENSITIVE_PORTS?.split(','), bridgeProbe }) {
    this.rules = parseTargetRules(rules);
    this.proxyAdminUrl = proxyAdminUrl;
    this.proxyAdminSocket = proxyAdminSocket;
    this.proxyAdminToken = proxyAdminToken;
    this.proxySocket = proxySocket;
    this.proxyServer = proxyServer;
    this.dataRoot = resolve(dataRoot ?? join(tmpdir(), 'standalone-browser'));
    this.launcher = launcher;
    this.now = now;
    this.logger = logger;
    this.maxSessions = maxSessions;
    this.networkInspector = networkInspector;
    this.bridgeGateway = bridgeGateway;
    this.sensitivePorts = sensitivePorts;
    this.bridgeProbe = bridgeProbe ?? ((host, port) => this.probeTcp(host, port));
    this.sessions = new Map();
    this.tombstones = new Map();
    this.createRequests = new Map();
    this.creating = 0;
    this.browser = null;
    this.sandboxVerified = false;
  }

  async start() {
    mkdirSync(this.dataRoot, { recursive: true, mode: 0o700 });
    chmodSync(this.dataRoot, 0o700);
    this.verifyNetworkNamespace();
    await this.verifyHostBridgeIsolation();
    if (this.proxySocket) {
      this.proxyRelay = createLoopbackProxyRelay(this.proxySocket);
      await new Promise((resolveListen, reject) => this.proxyRelay.once('error', reject).listen(Number(process.env.BROWSER_LOOPBACK_PROXY_PORT ?? 8080), '127.0.0.1', resolveListen));
    }
    this.browser = await this.launcher.launch({
      headless: true,
      chromiumSandbox: true,
      executablePath: process.env.CHROMIUM_PATH || undefined,
      proxy: { server: this.proxyServer },
      args: ['--proxy-bypass-list=<-loopback>', '--host-resolver-rules=MAP * ~NOTFOUND'],
      env: { PATH: process.env.PATH || '/usr/bin:/bin', HOME: '/tmp/chrome-home', LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8', TZ: 'UTC' },
      timeout: 20_000,
    });
    try {
      this.sandboxVerified = await this.verifySandbox(this.browser);
      requireValue(this.sandboxVerified, 'chromium-sandbox-unverified', 'Chromium 沙箱状态未能验证。', 503);
    } catch (error) {
      await this.browser.close();
      this.browser = null;
      this.sandboxVerified = false;
      throw error instanceof BrowserError ? error : new BrowserError('chromium-sandbox-unverified', 'Chromium 沙箱状态未能验证。', 503);
    }
    this.reaper = setInterval(() => this.reap().catch(() => {}), 1000);
    this.reaper.unref();
    return { ready: true, sandboxVerified: true };
  }

  verifyNetworkNamespace() {
    const interfaces = this.networkInspector();
    const external = Object.entries(interfaces).filter(([name, addresses]) => name !== 'lo' && (addresses ?? []).some((address) => !address.internal));
    requireValue(external.length === 0, 'worker-network-not-isolated', '浏览器 worker 必须没有非 loopback 网络接口。', 503);
  }

  async verifyHostBridgeIsolation() {
    const host = this.bridgeGateway;
    const ports = this.sensitivePorts;
    requireValue(host && isIP(host) === 4 && Array.isArray(ports) && ports.length > 0, 'bridge-probe-not-configured', '必须配置宿主 bridge 网关和敏感端口探针。', 503);
    for (const part of ports) {
      const port = Number(part);
      requireValue(Number.isInteger(port) && port >= 1 && port <= 65535, 'bridge-probe-not-configured', '宿主 bridge 敏感端口配置无效。', 503);
      const outcome = await this.bridgeProbe(host, port);
      requireValue(['ENETUNREACH', 'EHOSTUNREACH', 'ENETDOWN'].includes(outcome), 'host-bridge-reachable', '浏览器 worker 能触达宿主 bridge 敏感端口，拒绝启动。', 503);
    }
  }

  probeTcp(host, port) {
    return new Promise((resolveProbe) => {
      const socket = tcpConnect({ host, port });
      socket.setTimeout(400);
      socket.once('connect', () => { socket.destroy(); resolveProbe('connected'); });
      socket.once('timeout', () => { socket.destroy(); resolveProbe('timeout'); });
      socket.once('error', (error) => resolveProbe(error.code ?? 'error'));
    });
  }

  async updateProxyLease(body) {
    return proxyAdmin({ url: this.proxyAdminUrl, socketPath: this.proxyAdminSocket, token: this.proxyAdminToken }, body);
  }

  async verifySandbox(browser) {
    const context = await browser.newContext({ serviceWorkers: 'block', acceptDownloads: false });
    try {
      const page = await context.newPage();
      await page.goto('chrome://sandbox', { waitUntil: 'domcontentloaded', timeout: 5000 });
      const status = (await page.locator('body').innerText({ timeout: 3000 })).toLowerCase();
      // Check Chromium's named rows, not nearby text that merely contains "yes".
      const rows = status.split(/\r?\n/u).map((line) => line.trim().replace(/\s+/gu, ' '));
      const hasRow = (label, value) => rows.some((line) => new RegExp(`^${label}\\s+${value}$`, 'iu').test(line));
      const layerOneNamespace = hasRow('layer 1 sandbox', 'namespace') || hasRow('namespace sandbox', 'yes');
      return layerOneNamespace && hasRow('pid namespaces', 'yes') && hasRow('seccomp-bpf sandbox', 'yes');
    } catch { return false; }
    finally { await context.close().catch(() => {}); }
  }

  async create(input) {
    requireValue(this.browser && this.sandboxVerified, 'browser-not-ready', '浏览器沙箱尚未通过启动检查。', 503);
    const operationId = input?.operationId;
    requireValue(typeof operationId === 'string' && /^[A-Za-z0-9-]{16,80}$/u.test(operationId), 'invalid-operation-id', '创建操作 ID 无效。');
    const botId = simpleId(input?.botId, 'Bot ID');
    const taskId = simpleId(input?.taskId, 'task ID');
    const leaseMs = input?.leaseMs ?? 60_000;
    requireValue(Number.isSafeInteger(leaseMs) && leaseMs >= 1000 && leaseMs <= MAX_LEASE_MS, 'invalid-lease', '浏览器租约须为 1–120 秒。');
    requireValue(Array.isArray(input?.allowedOrigins) && input.allowedOrigins.length > 0 && input.allowedOrigins.length <= 8, 'invalid-target-scope', '须指定一个或多个允许 origin。');
    const allowedOrigins = [...new Set(input.allowedOrigins)];
    for (const origin of allowedOrigins) requireValue(this.rules.has(origin), 'target-origin-denied', '目标 origin 不在部署授权范围。', 403);
    const fingerprint = stableFingerprint({ botId, taskId, leaseMs, allowedOrigins });
    const existing = this.createRequests.get(operationId);
    if (existing) {
      requireValue(existing.fingerprint === fingerprint, 'operation-id-conflict', '创建操作 ID 已用于不同参数。', 409);
      return existing.promise;
    }
    requireValue(this.sessions.size + this.creating < this.maxSessions, 'session-limit', '浏览器活动会话已达上限。', 429);
    requireValue(this.createRequests.size < 128, 'create-idempotency-capacity', '创建操作缓存已达上限。', 429);
    this.creating += 1;
    const record = { fingerprint, createdAt: this.now(), sessionId: null, promise: null };
    this.createRequests.set(operationId, record);
    record.promise = this.createReserved({ operationId, botId, taskId, leaseMs, allowedOrigins, record }).finally(() => { this.creating -= 1; });
    return record.promise;
  }

  async createReserved({ operationId, botId, taskId, leaseMs, allowedOrigins, record }) {
    const id = randomUUID();
    record.sessionId = id;
    const secret = randomBytes(32).toString('base64url');
    const expiresAt = this.now() + leaseMs;
    const directory = mkdtempSync(join(this.dataRoot, 'session-'));
    chmodSync(directory, 0o700);
    const session = { id, botId, taskId, secret, expiresAt, allowedOrigins: new Set(allowedOrigins), directory, context: null, page: null, nextSequence: 1, steps: 0, operations: new Map(), busy: null, state: 'starting', screenshots: new Map() };
    try {
      await this.updateProxyLease({ sessionId: id, secret, expiresAt, origins: allowedOrigins });
      session.context = await this.browser.newContext({
        acceptDownloads: false,
        serviceWorkers: 'block',
        proxy: { server: this.proxyServer, username: id, password: secret },
        viewport: { width: 1280, height: 800 },
      });
      session.context.setDefaultTimeout(OP_TIMEOUT_MS);
      session.context.setDefaultNavigationTimeout(OP_TIMEOUT_MS);
      session.context.route('**/*', async (route) => {
        try {
          const target = canonicalTarget(route.request().url());
          requireValue(session.allowedOrigins.has(target.origin), 'target-origin-denied', '页面请求目标未获精确授权。', 403);
          await route.continue();
        } catch { await route.abort('blockedbyclient').catch(() => {}); }
      });
      session.context.routeWebSocket('**/*', (webSocketRoute) => webSocketRoute.close());
      session.context.on('page', (page) => {
        if (session.page && page !== session.page) page.close().catch(() => {});
        page.on('download', (download) => download.cancel().catch(() => {}));
      });
      session.page = await session.context.newPage();
      session.state = 'active';
      this.sessions.set(id, session);
      this.event(session, 'session-created');
      return { operationId, sessionId: id, taskId, expiresAt, stepBudget: MAX_STEPS };
    } catch (error) {
      await session.context?.close().catch(() => {});
      await this.updateProxyLease({ sessionId: id, close: true }).catch(() => {});
      rmSync(directory, { recursive: true, force: true });
      throw error;
    }
  }

  assertScope(session, input) {
    requireValue(input?.botId === session.botId && input?.taskId === session.taskId, 'session-scope-denied', '浏览器会话归属不匹配。', 404);
    requireValue(session.state === 'active' && session.expiresAt > this.now(), 'session-expired', '浏览器会话已结束或租约已过期。', 410);
  }

  async operate(id, input) {
    const session = this.sessions.get(id);
    if (!session) {
      const old = this.tombstones.get(id);
      requireValue(old && old.botId === input?.botId && old.taskId === input?.taskId, 'session-not-found', '浏览器会话不存在。', 404);
      const cached = old.closeOperation;
      requireValue(input?.action === 'close' && cached && cached.operationId === input.operationId, 'session-not-found', '浏览器会话不存在。', 404);
      requireValue(cached.fingerprint === stableFingerprint({ action: input.action, args: input.args ?? {}, sequence: input.sequence }), 'operation-id-conflict', '操作 ID 已用于不同请求。', 409);
      return cached.promise;
    }
    this.assertScope(session, input);
    const { operationId, sequence, action, args = {} } = input;
    requireValue(typeof operationId === 'string' && /^[A-Za-z0-9-]{16,80}$/u.test(operationId), 'invalid-operation-id', '操作 ID 无效。');
    requireValue(Number.isSafeInteger(sequence) && sequence > 0, 'invalid-operation-sequence', '操作序号无效。');
    const fingerprint = stableFingerprint({ action, args, sequence });
    const old = session.operations.get(operationId);
    if (old) {
      requireValue(old.fingerprint === fingerprint, 'operation-id-conflict', '操作 ID 已用于不同请求。', 409);
      return old.promise;
    }
    requireValue(sequence === session.nextSequence, 'operation-sequence-conflict', '操作序号不连续。', 409);
    requireValue(!session.busy, 'session-busy', '浏览器会话正在执行另一个操作。', 409);
    requireValue(session.steps < MAX_STEPS, 'step-budget-exhausted', '浏览器步骤预算已用完。', 429);
    session.nextSequence += 1;
    session.steps += 1;
    const promise = this.runAction(session, action, args).then((result) => {
      requireValue(action === 'close' || session.state === 'active', 'session-terminated', '浏览器会话已终止，操作结果已丢弃。', 410);
      this.event(session, 'operation-completed', action);
      return { sessionId: id, taskId: session.taskId, operationId, sequence, status: 'completed', result };
    }).catch((error) => {
      this.event(session, 'operation-refused', error.code ?? 'operation-failed');
      throw error instanceof BrowserError ? error : new BrowserError('browser-operation-failed', '浏览器操作未完成。', 502);
    }).finally(() => { session.busy = null; });
    session.busy = promise;
    const operation = { fingerprint, promise, operationId };
    session.operations.set(operationId, operation);
    if (action === 'close') session.closingOperation = operation;
    while (session.operations.size > 32) session.operations.delete(session.operations.keys().next().value);
    return promise;
  }

  async runAction(session, action, args) {
    const page = session.page;
    if (action === 'navigate') {
      requireValue(typeof args.url === 'string' && args.url.length <= 2048, 'invalid-target', '导航 URL 无效。');
      const target = canonicalTarget(args.url);
      requireValue(session.allowedOrigins.has(target.origin), 'target-origin-denied', '目标 origin 未获精确授权。', 403);
      await page.goto(target.href, { waitUntil: 'domcontentloaded', timeout: OP_TIMEOUT_MS });
      return { url: page.url() };
    }
    if (action === 'read') {
      const selector = args.selector === undefined ? 'body' : this.selector(args.selector);
      const text = await page.locator(selector).innerText({ timeout: OP_TIMEOUT_MS });
      return { text: text.slice(0, MAX_TEXT), truncated: text.length > MAX_TEXT, trust: 'untrusted-page-content' };
    }
    if (action === 'click') {
      const selector = this.selector(args.selector);
      await page.locator(selector).click({ timeout: OP_TIMEOUT_MS });
      return { clicked: true };
    }
    if (action === 'type') {
      const selector = this.selector(args.selector);
      requireValue(typeof args.text === 'string' && args.text.length <= 4096 && !args.text.includes('\0'), 'invalid-type-input', '输入文字不能超过 4096 字符。');
      await page.locator(selector).fill(args.text, { timeout: OP_TIMEOUT_MS });
      return { typed: true, characters: args.text.length };
    }
    if (action === 'scroll') {
      requireValue(['up', 'down'].includes(args.direction), 'invalid-scroll', '滚动方向须为 up 或 down。');
      const pixels = args.pixels ?? 400;
      requireValue(Number.isInteger(pixels) && pixels > 0 && pixels <= 1000, 'invalid-scroll', '滚动距离须为 1–1000 像素。');
      await page.mouse.wheel(0, args.direction === 'down' ? pixels : -pixels);
      return { scrolled: args.direction, pixels };
    }
    if (action === 'screenshot') {
      const resourceId = randomUUID();
      const path = join(session.directory, `${resourceId}.png`);
      const bytes = await page.screenshot({ type: 'png', fullPage: false, timeout: OP_TIMEOUT_MS });
      requireValue(Buffer.isBuffer(bytes) && bytes.length > 0 && bytes.length <= MAX_SCREENSHOT_BYTES, 'screenshot-too-large', '截图超过 8 MiB 上限。', 413);
      writeFileSync(path, bytes, { mode: 0o600, flag: 'wx' });
      session.screenshots.set(resourceId, path);
      return { resourceId, contentType: 'image/png', bytes: bytes.length };
    }
    if (action === 'close') {
      await this.closeSession(session, 'closed');
      return { closed: true };
    }
    throw new BrowserError('unsupported-browser-action', '浏览器操作不受支持。');
  }

  selector(value) {
    requireValue(typeof value === 'string' && value.length > 0 && value.length <= 512 && !value.includes('\0'), 'invalid-selector', '页面选择器无效。');
    requireValue(!/^\s*(?:javascript:|xpath=\/\/|\/\/)/iu.test(value), 'invalid-selector', '选择器格式不受支持。');
    return value;
  }

  async screenshot(id, input, resourceId) {
    const session = this.sessions.get(id);
    requireValue(session, 'session-not-found', '浏览器会话不存在。', 404);
    this.assertScope(session, input);
    const path = session.screenshots.get(resourceId);
    requireValue(path, 'screenshot-not-found', '截图资源不存在。', 404);
    return readFileSync(path);
  }

  async cancel(id, input) {
    const session = this.sessions.get(id);
    requireValue(session, 'session-not-found', '浏览器会话不存在。', 404);
    this.assertScope(session, input);
    await this.closeSession(session, 'cancelled');
    return { sessionId: id, status: 'cancelled' };
  }

  async close(id, input) {
    const session = this.sessions.get(id);
    if (!session) {
      const old = this.tombstones.get(id);
      requireValue(old && old.botId === input?.botId && old.taskId === input?.taskId, 'session-not-found', '浏览器会话不存在。', 404);
      return { sessionId: id, status: old.status };
    }
    requireValue(input?.botId === session.botId && input?.taskId === session.taskId, 'session-scope-denied', '浏览器会话归属不匹配。', 404);
    await this.closeSession(session, 'closed');
    return { sessionId: id, status: 'closed' };
  }

  async closeSession(session, status) {
    if (session.state === 'closed' || session.state === 'cancelled') return;
    session.state = status;
    this.sessions.delete(session.id);
    await session.context?.close().catch(() => {});
    await this.updateProxyLease({ sessionId: session.id, close: true }).catch(() => {});
    rmSync(session.directory, { recursive: true, force: true });
    this.tombstones.set(session.id, { botId: session.botId, taskId: session.taskId, status, at: this.now(), closeOperation: session.closingOperation });
    this.event(session, `session-${status}`);
  }

  async reap() {
    for (const session of this.sessions.values()) if (session.expiresAt <= this.now()) await this.closeSession(session, 'expired');
    for (const [id, tombstone] of this.tombstones) if (this.now() - tombstone.at > 60_000) this.tombstones.delete(id);
    for (const [operationId, record] of this.createRequests) {
      if (this.now() - record.createdAt > 10 * 60_000 && (!record.sessionId || !this.sessions.has(record.sessionId))) this.createRequests.delete(operationId);
    }
  }

  event(session, event, detail) {
    this.logger({ event, sessionId: session.id, botId: session.botId, taskId: session.taskId, action: typeof detail === 'string' && /^[a-z-]+$/u.test(detail) ? detail : null, at: this.now() });
  }

  async stop() {
    clearInterval(this.reaper);
    for (const session of [...this.sessions.values()]) await this.closeSession(session, 'cancelled');
    await this.browser?.close().catch(() => {});
    if (this.proxyRelay) await new Promise((resolveClose) => this.proxyRelay.close(resolveClose));
    this.browser = null;
    this.sandboxVerified = false;
  }
}

export function createWorkerServer(worker, logger = () => {}) {
  const server = createServer(async (req, res) => {
    try {
      if (req.url === '/health' && req.method === 'GET') return safeJson(res, 200, { ready: !!worker.browser, sandboxVerified: worker.sandboxVerified });
      const body = ['GET', 'HEAD'].includes(req.method) ? {} : await readJson(req);
      if (req.method === 'POST' && req.url === '/v1/sessions') return safeJson(res, 201, await worker.create(body));
      const route = /^\/v1\/sessions\/([^/]+)(?:\/(operations|cancel|close|screenshots\/([^/]+)))?$/u.exec(req.url ?? '');
      requireValue(route, 'not-found', '接口不存在。', 404);
      const [, id, op, resourceId] = route;
      if (op === 'operations' && req.method === 'POST') return safeJson(res, 200, await worker.operate(id, body));
      if (op === 'cancel' && req.method === 'POST') return safeJson(res, 200, await worker.cancel(id, body));
      if (op === 'close' && req.method === 'POST') return safeJson(res, 200, await worker.close(id, body));
      if (op?.startsWith('screenshots/') && req.method === 'POST') {
        const bytes = await worker.screenshot(id, body, resourceId);
        res.writeHead(200, { 'content-type': 'image/png', 'content-length': bytes.length, 'cache-control': 'private, no-store' });
        return res.end(bytes);
      }
      throw new BrowserError('not-found', '接口不存在。', 404);
    } catch (error) {
      const safe = error instanceof BrowserError
        ? error
        : new BrowserError('internal-error', '浏览器请求未完成。', 500);
      logger({ event: 'worker-request-failed', code: safe.code });
      if (!res.headersSent) safeJson(res, safe.status, { error: { code: safe.code, message: safe.message } });
      else res.destroy();
    }
  });
  server.on('clientError', (_error, socket) => socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n'));
  return server;
}

export async function listenUnix(server, socketPath) {
  mkdirSync(resolve(socketPath, '..'), { recursive: true, mode: 0o700 });
  try {
    const current = lstatSync(socketPath);
    requireValue(current.isSocket(), 'control-socket-path-invalid', '拒绝替换非 socket 控制路径。', 500);
    unlinkSync(socketPath);
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  server.listen(socketPath);
  await new Promise((resolveListen, reject) => { server.once('listening', resolveListen); server.once('error', reject); });
  chmodSync(socketPath, 0o600);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const worker = new BrowserWorker({
    rules: process.env.BROWSER_TARGET_RULES,
    proxyAdminUrl: process.env.BROWSER_PROXY_ADMIN_URL || 'http://egress:9090/internal/leases',
    proxyAdminSocket: process.env.BROWSER_PROXY_ADMIN_SOCKET,
    proxyAdminToken: process.env.BROWSER_PROXY_ADMIN_TOKEN,
    proxySocket: process.env.BROWSER_PROXY_SOCKET,
    proxyServer: process.env.BROWSER_PROXY_URL || 'http://127.0.0.1:8080',
    dataRoot: process.env.BROWSER_DATA_ROOT || '/tmp/browser-sessions',
  });
  await worker.start();
  const server = createWorkerServer(worker);
  await listenUnix(server, process.env.BROWSER_CONTROL_SOCKET || '/run/browser-control/worker.sock');
  const stop = async () => { server.close(); await worker.stop(); process.exit(0); };
  process.once('SIGTERM', stop); process.once('SIGINT', stop);
}

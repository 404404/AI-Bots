import { createServer, request as httpRequest } from 'node:http';
import { connect as tcpConnect } from 'node:net';
import { timingSafeEqual } from 'node:crypto';
import { Transform } from 'node:stream';
import { chmodSync, lstatSync, mkdirSync, unlinkSync } from 'node:fs';
import { dirname } from 'node:path';
import { parseTargetRules, authorizeTarget } from './policy.mjs';
import { BrowserError, requireValue } from './errors.mjs';

const HOP_HEADERS = new Set(['connection', 'proxy-connection', 'proxy-authorization', 'proxy-authenticate', 'keep-alive', 'te', 'trailer', 'transfer-encoding', 'upgrade']);
const MAX_BODY = 64 * 1024;
const MAX_RESPONSE = 8 * 1024 * 1024;
const MAX_LEASES = 128;
const MAX_CONNECTIONS_PER_LEASE = 16;
const MAX_TUNNEL_BYTES = 16 * 1024 * 1024;
const MAX_TUNNEL_MS = 30_000;
const CONNECT_TIMEOUT_MS = 10_000;
const REQUEST_TIMEOUT_MS = 10_000;

function safeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && timingSafeEqual(left, right);
}

function json(res, status, body) {
  const bytes = Buffer.from(JSON.stringify(body));
  res.writeHead(status, { 'content-type': 'application/json', 'content-length': bytes.length, 'cache-control': 'no-store' });
  res.end(bytes);
}

function publicError(error) {
  return error instanceof BrowserError
    ? { code: error.code, message: error.message, status: error.status }
    : { code: 'upstream-failed', message: 'The restricted upstream request failed.', status: 502 };
}

function authLease(header, leases, now) {
  if (typeof header !== 'string' || !header.startsWith('Basic ')) return null;
  let decoded;
  try { decoded = Buffer.from(header.slice(6), 'base64').toString('utf8'); } catch { return null; }
  const colon = decoded.indexOf(':');
  if (colon < 1) return null;
  const id = decoded.slice(0, colon), secret = decoded.slice(colon + 1);
  const lease = leases.get(id);
  if (!lease || lease.expiresAt <= now || !safeEqual(secret, lease.secret)) return null;
  return lease;
}

export function parseConnectAuthority(authority) {
  requireValue(typeof authority === 'string' && /^[^\s/?#@]+:\d{1,5}$/u.test(authority), 'invalid-proxy-target', 'CONNECT target must include an explicit port.', 403);
  const portText = authority.slice(authority.lastIndexOf(':') + 1);
  const port = Number(portText);
  requireValue(Number.isInteger(port) && port >= 1 && port <= 65535, 'invalid-proxy-target', 'CONNECT target port is invalid.', 403);
  let url;
  try { url = new URL(`https://${authority}`); } catch { throw new BrowserError('invalid-proxy-target', 'CONNECT target is invalid.', 403); }
  requireValue(!url.username && !url.password && url.pathname === '/' && !url.search && !url.hash, 'invalid-proxy-target', 'CONNECT target is invalid.', 403);
  return { url, port };
}

function filteredHeaders(headers, host) {
  const result = {};
  for (const [name, value] of Object.entries(headers)) {
    if (!HOP_HEADERS.has(name.toLowerCase())) result[name] = value;
  }
  result.host = host;
  result.connection = 'close';
  return result;
}

function filteredResponseHeaders(headers) {
  const result = {};
  for (const [name, value] of Object.entries(headers)) if (!HOP_HEADERS.has(name.toLowerCase()) && name.toLowerCase() !== 'host') result[name] = value;
  result.connection = 'close';
  return result;
}

export function createRestrictedProxy({ rawRules, adminToken, lookup, httpRequestImpl = httpRequest, tcpConnectImpl = tcpConnect, now = () => Date.now(), logger = () => {} }) {
  requireValue(typeof adminToken === 'string' && adminToken.length >= 32, 'proxy-config-invalid', '代理内部 token 必须至少 32 字符。', 500);
  const rules = parseTargetRules(rawRules);
  const leases = new Map();

  function isCurrentLease(lease) {
    return leases.get(lease.id) === lease && lease.expiresAt > now();
  }

  function revokeLease(id) {
    const lease = leases.get(id);
    if (!lease) return;
    leases.delete(id);
    for (const connection of [...lease.connections]) connection.destroy();
    lease.connections.clear();
  }

  function trackConnection(lease, connection) {
    if (!isCurrentLease(lease) || lease.connections.size >= MAX_CONNECTIONS_PER_LEASE) return false;
    lease.connections.add(connection);
    connection.once('close', () => lease.connections.delete(connection));
    return true;
  }

  const reaper = setInterval(() => {
    for (const [id, lease] of leases) if (lease.expiresAt <= now()) revokeLease(id);
  }, 1000);
  reaper.unref();

  const admin = createServer(async (req, res) => {
    if (req.method !== 'POST' || !req.url?.startsWith('/internal/leases')) return json(res, 404, { error: { code: 'not-found' } });
    if (!safeEqual(req.headers['x-proxy-admin-token'] ?? '', adminToken)) return json(res, 403, { error: { code: 'forbidden' } });
    let chunks = [], length = 0;
    for await (const chunk of req) {
      length += chunk.length;
      if (length > 16 * 1024) { req.destroy(); return json(res, 413, { error: { code: 'body-too-large' } }); }
      chunks.push(chunk);
    }
    let body;
    try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return json(res, 400, { error: { code: 'invalid-json' } }); }
    const url = new URL(req.url, 'http://admin.local');
    if (url.pathname === '/internal/leases') {
      const { sessionId, secret, expiresAt, origins } = body ?? {};
      if (typeof sessionId !== 'string' || !/^[a-f0-9-]{36}$/iu.test(sessionId) || typeof secret !== 'string' || secret.length < 32 || !Number.isSafeInteger(expiresAt) || expiresAt <= now() || expiresAt > now() + 5 * 60_000 || !Array.isArray(origins) || origins.length < 1 || origins.length > 8)
        return json(res, 400, { error: { code: 'invalid-lease' } });
      if (leases.size >= MAX_LEASES && !leases.has(sessionId)) return json(res, 429, { error: { code: 'lease-capacity' } });
      const allowedRules = new Map();
      for (const origin of origins) {
        const rule = rules.get(origin);
        if (!rule) return json(res, 403, { error: { code: 'origin-not-configured' } });
        allowedRules.set(origin, rule);
      }
      revokeLease(sessionId);
      const lease = { id: sessionId, secret, expiresAt, rules: allowedRules, connections: new Set() };
      leases.set(sessionId, lease);
      return json(res, 201, { ok: true });
    }
    const match = /^\/internal\/leases\/([a-f0-9-]{36})\/close$/iu.exec(url.pathname);
    if (match) { revokeLease(match[1]); return json(res, 200, { ok: true }); }
    return json(res, 404, { error: { code: 'not-found' } });
  });

  const proxy = createServer(async (req, res) => {
    const lease = authLease(req.headers['proxy-authorization'], leases, now());
    if (!lease) { res.writeHead(407, { 'proxy-authenticate': 'Basic realm="restricted-browser"', connection: 'close' }); return res.end(); }
    if (lease.connections.size >= MAX_CONNECTIONS_PER_LEASE) return json(res, 429, { error: { code: 'lease-connection-limit' } });
    let target, resolved;
    try {
      target = new URL(req.url);
      requireValue(target.protocol === 'http:' && !target.username && !target.password, 'proxy-protocol-denied', 'Only HTTP proxy requests are accepted; HTTPS must use CONNECT.', 403);
      requireValue(['GET', 'HEAD', 'POST'].includes(req.method), 'proxy-method-denied', 'This proxy method is not enabled.', 403);
      requireValue(!req.headers.upgrade, 'websocket-denied', 'WebSocket upgrades are disabled.', 403);
      requireValue(lease.rules.has(target.origin), 'target-origin-denied', 'Target origin is not authorized.', 403);
      resolved = await authorizeTarget(target, lease.rules, lookup);
    } catch (error) {
      const safe = publicError(error);
      logger({ event: 'proxy-denied', code: safe.code });
      return json(res, safe.status, { error: { code: safe.code, message: safe.message } });
    }
    if (!isCurrentLease(lease)) return json(res, 407, { error: { code: 'lease-expired' } });
    const contentLength = Number(req.headers['content-length'] ?? 0);
    if (!Number.isSafeInteger(contentLength) || contentLength < 0 || contentLength > MAX_BODY) return json(res, 413, { error: { code: 'request-too-large' } });
    const options = {
      protocol: 'http:', hostname: resolved.url.hostname, port: resolved.url.port || 80,
      method: req.method, path: `${resolved.url.pathname}${resolved.url.search}`,
      headers: filteredHeaders(req.headers, resolved.url.host),
      lookup: (_host, options, callback) => options?.all
        ? callback(null, [{ address: resolved.address, family: resolved.family }])
        : callback(null, resolved.address, resolved.family),
      timeout: REQUEST_TIMEOUT_MS,
    };
    const upstream = httpRequestImpl(options, (upstreamResponse) => {
      const length = Number(upstreamResponse.headers['content-length'] ?? 0);
      if (Number.isSafeInteger(length) && length > MAX_RESPONSE) {
        upstreamResponse.destroy();
        return json(res, 502, { error: { code: 'response-too-large' } });
      }
      res.writeHead(upstreamResponse.statusCode ?? 502, filteredResponseHeaders(upstreamResponse.headers));
      let received = 0;
      upstreamResponse.on('data', (chunk) => {
        received += chunk.length;
        if (received > MAX_RESPONSE) {
          upstreamResponse.destroy();
          res.destroy();
        }
      });
      upstreamResponse.pipe(res);
    });
    upstream.on('timeout', () => upstream.destroy(new Error('upstream timeout')));
    upstream.on('error', () => { if (!res.headersSent && !res.destroyed) json(res, 502, { error: { code: 'upstream-failed' } }); else if (!res.destroyed) res.destroy(); });
    if (!trackConnection(lease, upstream)) { upstream.destroy(); return json(res, 429, { error: { code: 'lease-connection-limit' } }); }
    const abortUpstream = () => { if (!res.writableEnded) upstream.destroy(); };
    req.once('aborted', abortUpstream);
    res.once('close', abortUpstream);
    let received = 0;
    const bounded = new Transform({ transform(chunk, _encoding, callback) {
      received += chunk.length;
      if (received > MAX_BODY) callback(new Error('request too large'));
      else callback(null, chunk);
    } });
    bounded.on('error', () => {
      upstream.destroy();
      if (!res.headersSent) json(res, 413, { error: { code: 'request-too-large' } });
      req.destroy();
    });
    req.pipe(bounded).pipe(upstream);
  });

  proxy.on('connect', async (req, client, head) => {
    const lease = authLease(req.headers['proxy-authorization'], leases, now());
    if (!lease) { client.end('HTTP/1.1 407 Proxy Authentication Required\r\nProxy-Authenticate: Basic realm="restricted-browser"\r\nConnection: close\r\n\r\n'); return; }
    if (lease.connections.size >= MAX_CONNECTIONS_PER_LEASE) { client.end('HTTP/1.1 429 Too Many Connections\r\nConnection: close\r\n\r\n'); return; }
    let target, resolved, connectPort;
    try {
      const parsed = parseConnectAuthority(req.url);
      target = parsed.url;
      connectPort = parsed.port;
      requireValue(lease.rules.has(target.origin), 'target-origin-denied', 'Target origin is not authorized.', 403);
      resolved = await authorizeTarget(target, lease.rules, lookup);
      requireValue(target.protocol === 'https:', 'proxy-protocol-denied', 'CONNECT is only enabled for HTTPS.', 403);
      requireValue(!client.destroyed && isCurrentLease(lease), 'lease-expired', 'Proxy lease expired before connecting.', 403);
    } catch (error) {
      const safe = publicError(error);
      logger({ event: 'proxy-connect-denied', code: safe.code });
      const status = safe.status >= 400 && safe.status < 600 ? safe.status : 502;
      client.end(`HTTP/1.1 ${status} ${safe.code}\r\nConnection: close\r\n\r\n`);
      return;
    }
    const upstream = tcpConnectImpl({ host: resolved.address, family: resolved.family, port: connectPort });
    let connected = false;
    let transferred = 0;
    let closed = false;
    let timeout, wallClock;
    const cleanup = () => {
      if (closed) return;
      closed = true;
      clearTimeout(timeout);
      clearTimeout(wallClock);
      upstream.destroy();
      if (!client.destroyed) client.destroy();
    };
    if (!trackConnection(lease, { destroy: cleanup, once: (event, callback) => upstream.once(event, callback) })) {
      cleanup();
      if (!client.destroyed) client.end('HTTP/1.1 429 Too Many Connections\r\nConnection: close\r\n\r\n');
      return;
    }
    timeout = setTimeout(() => {
      if (!connected && !client.destroyed) {
        upstream.destroy();
        client.end('HTTP/1.1 504 Gateway Timeout\r\nConnection: close\r\n\r\n');
      } else cleanup();
    }, CONNECT_TIMEOUT_MS);
    wallClock = setTimeout(cleanup, MAX_TUNNEL_MS);
    upstream.once('close', cleanup);
    client.once('close', cleanup);
    client.once('error', cleanup);
    upstream.once('error', () => {
      if (!client.destroyed && !connected) {
        upstream.destroy();
        client.end('HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\n\r\n');
      } else cleanup();
    });
    upstream.once('connect', () => {
      if (!isCurrentLease(lease) || client.destroyed) { clearTimeout(wallClock); cleanup(); return; }
      connected = true;
      clearTimeout(timeout);
      client.write('HTTP/1.1 200 Connection Established\r\nProxy-Agent: restricted-browser\r\n\r\n');
      if (head.length) upstream.write(head);
      const countBytes = (chunk) => {
        transferred += chunk.length;
        if (transferred > MAX_TUNNEL_BYTES) cleanup();
      };
      client.on('data', countBytes);
      upstream.on('data', countBytes);
      upstream.pipe(client);
      client.pipe(upstream);
    });
  });
  proxy.on('upgrade', (_req, socket) => socket.end('HTTP/1.1 403 WebSocket Disabled\r\nConnection: close\r\n\r\n'));

  return {
    proxy,
    admin,
    leases,
    listen({ proxyPort = 8080, adminPort = 9090, host = '0.0.0.0' } = {}) {
      return Promise.all([
        new Promise((resolve, reject) => proxy.once('error', reject).listen(proxyPort, host, resolve)),
        new Promise((resolve, reject) => admin.once('error', reject).listen(adminPort, host, resolve)),
      ]);
    },
    listenUnix({ proxySocketPath, adminSocketPath }) {
      const listenSocket = (server, socketPath) => new Promise((resolve, reject) => {
        mkdirSync(dirname(socketPath), { recursive: true, mode: 0o700 });
        try {
          const current = lstatSync(socketPath);
          if (!current.isSocket()) throw new Error('Refusing to replace a non-socket proxy path.');
          unlinkSync(socketPath);
        } catch (error) { if (error.code !== 'ENOENT') return reject(error); }
        server.once('error', reject).listen(socketPath, () => {
          try { chmodSync(socketPath, 0o600); resolve(); } catch (error) { reject(error); }
        });
      });
      return Promise.all([listenSocket(proxy, proxySocketPath), listenSocket(admin, adminSocketPath)]);
    },
    reap() { for (const [id, lease] of leases) if (lease.expiresAt <= now()) revokeLease(id); },
    close() {
      clearInterval(reaper);
      for (const id of [...leases.keys()]) revokeLease(id);
      proxy.close();
      admin.close();
    },
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const rawRules = process.env.BROWSER_TARGET_RULES;
  const adminToken = process.env.BROWSER_PROXY_ADMIN_TOKEN;
  if (!rawRules || !adminToken) throw new Error('BROWSER_TARGET_RULES and BROWSER_PROXY_ADMIN_TOKEN are required.');
  const service = createRestrictedProxy({ rawRules, adminToken, logger: (event) => process.stderr.write(`${JSON.stringify(event)}\n`) });
  if (process.env.BROWSER_PROXY_SOCKET && process.env.BROWSER_PROXY_ADMIN_SOCKET) {
    await service.listenUnix({ proxySocketPath: process.env.BROWSER_PROXY_SOCKET, adminSocketPath: process.env.BROWSER_PROXY_ADMIN_SOCKET });
  } else {
    await service.listen({ proxyPort: Number(process.env.BROWSER_PROXY_PORT ?? 8080), adminPort: Number(process.env.BROWSER_PROXY_ADMIN_PORT ?? 9090) });
  }
}

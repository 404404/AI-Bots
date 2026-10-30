import { createServer, request as httpRequest } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const MAX_BODY = 128 * 1024;
const MAX_IMAGE = 8 * 1024 * 1024;

function safeEqual(left, right) {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  return a.length === b.length && timingSafeEqual(a, b);
}

function json(res, status, value) {
  const bytes = Buffer.from(JSON.stringify(value));
  res.writeHead(status, { 'content-type': 'application/json', 'content-length': bytes.length, 'cache-control': 'no-store' });
  res.end(bytes);
}

async function bodyBytes(req, limit) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw Object.assign(new Error('request too large'), { status: 413, code: 'request-too-large' });
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function workerRequest(socketPath, method, path, body, responseLimit = MAX_BODY) {
  return new Promise((resolve, reject) => {
    const req = httpRequest({ socketPath, path, method, headers: { 'content-type': 'application/json', ...(body ? { 'content-length': body.length } : {}) }, timeout: 20_000 }, (res) => {
      const chunks = [];
      let size = 0;
      const limit = responseLimit;
      res.on('data', (chunk) => {
        size += chunk.length;
        if (size > limit) { req.destroy(new Error('worker response too large')); return; }
        chunks.push(chunk);
      });
      res.on('end', () => resolve({ status: res.statusCode ?? 502, contentType: res.headers['content-type'] ?? 'application/json', bytes: Buffer.concat(chunks) }));
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('worker timeout')));
    if (body) req.write(body);
    req.end();
  });
}

export function createGateway({ socketPath = '/run/browser-control/worker.sock', serviceToken, logger = () => {} }) {
  if (typeof serviceToken !== 'string' || serviceToken.length < 32) throw new Error('BROWSER_CONTROL_TOKEN must be at least 32 characters.');
  return createServer(async (req, res) => {
    if (req.method === 'GET' && req.url === '/healthz') {
      try {
        const worker = await workerRequest(socketPath, 'GET', '/health', undefined, 4096);
        const status = JSON.parse(worker.bytes.toString('utf8'));
        const ready = worker.status === 200 && status.ready === true && status.sandboxVerified === true;
        return json(res, ready ? 200 : 503, { gatewayReady: true, workerReady: ready });
      } catch {
        return json(res, 503, { gatewayReady: true, workerReady: false });
      }
    }
    const authorization = req.headers.authorization ?? '';
    if (!/^Bearer\s+\S+$/iu.test(authorization) || !safeEqual(authorization.replace(/^Bearer\s+/iu, ''), serviceToken)) return json(res, 401, { error: { code: 'unauthorized', message: '需要服务身份验证。' } });
    try {
      const match = /^\/v1\/sessions(?:\/([a-f0-9-]{36})(?:\/(operations|cancel|close|screenshots\/([a-f0-9-]{36})))?)?$/iu.exec(req.url ?? '');
      if (!match) return json(res, 404, { error: { code: 'not-found' } });
      const [, sessionId, action, resourceId] = match;
      const screenshot = action?.startsWith('screenshots/');
      if (req.method !== 'POST') return json(res, 405, { error: { code: 'method-not-allowed' } });
      const bytes = await bodyBytes(req, MAX_BODY);
      let body;
      try { body = bytes.length ? JSON.parse(bytes.toString('utf8')) : {}; }
      catch { return json(res, 400, { error: { code: 'invalid-json' } }); }
      let path;
      if (!sessionId && !action) path = '/v1/sessions';
      else if (action === 'operations') path = `/v1/sessions/${sessionId}/operations`;
      else if (action === 'cancel') path = `/v1/sessions/${sessionId}/cancel`;
      else if (action === 'close') path = `/v1/sessions/${sessionId}/close`;
      else if (screenshot) path = `/v1/sessions/${sessionId}/screenshots/${resourceId}`;
      else return json(res, 404, { error: { code: 'not-found' } });
      const result = await workerRequest(socketPath, 'POST', path, bytes, screenshot ? MAX_IMAGE : MAX_BODY);
      if (result.contentType.startsWith('image/')) {
        res.writeHead(result.status, { 'content-type': result.contentType, 'content-length': result.bytes.length, 'cache-control': 'private, no-store' });
        return res.end(result.bytes);
      }
      res.writeHead(result.status, { 'content-type': 'application/json', 'content-length': result.bytes.length, 'cache-control': 'no-store' });
      return res.end(result.bytes);
    } catch (error) {
      const tooLarge = error?.code === 'request-too-large';
      logger({ event: 'gateway-request-failed', code: tooLarge ? 'request-too-large' : 'worker-unavailable' });
      json(res, tooLarge ? 413 : 503, { error: { code: tooLarge ? 'request-too-large' : 'worker-unavailable', message: tooLarge ? '请求体超过限制。' : '浏览器服务暂不可用。' } });
    }
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const server = createGateway({ socketPath: process.env.BROWSER_CONTROL_SOCKET || '/run/browser-control/worker.sock', serviceToken: process.env.BROWSER_CONTROL_TOKEN, logger: (entry) => process.stderr.write(`${JSON.stringify(entry)}\n`) });
  server.listen(Number(process.env.BROWSER_GATEWAY_PORT ?? 8090), process.env.BROWSER_GATEWAY_HOST ?? '0.0.0.0');
}

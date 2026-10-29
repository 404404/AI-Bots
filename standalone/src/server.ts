import { createServer } from 'node:http';
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, lstatSync, chmodSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { BotApplication } from './application.ts';
import { BotError, publicError, requireValue, text } from './errors.ts';

const digest = (value: string) => createHash('sha256').update(value).digest('hex');
export function allowedAddress(address: string) {
  const ip = address.replace(/^::ffff:/u, '');
  return (
    ip === '::1' ||
    ip.startsWith('127.') ||
    /^192\.168\.68\.(?:\d{1,3})$/u.test(ip) ||
    ip === '172.17.0.1'
  );
}

export async function startServer(options: {
  dataDir: string;
  port: number;
  host: string;
  publicUrl: string;
}) {
  process.umask(0o077);
  const publicUrl = new URL(options.publicUrl);
  requireValue(
    ['http:', 'https:'].includes(publicUrl.protocol) &&
      !publicUrl.username &&
      !publicUrl.password &&
      publicUrl.pathname === '/' &&
      !publicUrl.search &&
      !publicUrl.hash,
    'invalid-public-url',
    '公开地址无效。',
  );
  const loopbackHosts = new Set([`127.0.0.1:${options.port}`, `localhost:${options.port}`]);
  for (const hostname of ['127.0.0.1', 'localhost']) {
    const alias = new URL(publicUrl);
    alias.hostname = hostname;
    loopbackHosts.add(alias.host);
  }
  const app = new BotApplication(options.dataDir);
  const codeFile = join(app.storage.root, 'secrets', 'access-code');
  if (!existsSync(codeFile))
    writeFileSync(codeFile, randomBytes(24).toString('base64url'), { mode: 0o600, flag: 'wx' });
  requireValue(
    !lstatSync(codeFile).isSymbolicLink(),
    'unsafe-key-file',
    '访问码文件不能是符号链接。',
  );
  chmodSync(codeFile, 0o600);
  const accessDigest = Buffer.from(digest(readFileSync(codeFile, 'utf8').trim()), 'hex');
  const attempts = new Map<string, { count: number; until: number }>();
  const staticRoot = join(dirname(fileURLToPath(import.meta.url)), 'public');
  const server = createServer(async (req, res) => {
    res.setHeader('cache-control', 'no-store');
    res.setHeader('x-content-type-options', 'nosniff');
    res.setHeader('referrer-policy', 'no-referrer');
    res.setHeader(
      'content-security-policy',
      "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
    );
    const send = (status: number, data: unknown) => {
      res.statusCode = status;
      res.setHeader('content-type', 'application/json; charset=utf-8');
      res.end(JSON.stringify(data));
    };
    try {
      requireValue(
        allowedAddress(req.socket.remoteAddress ?? ''),
        'source-not-allowed',
        '来源地址未获允许。',
        403,
      );
      const path = req.url?.split('?')[0] ?? '/';
      const host = req.headers.host;
      requireValue(
        host === publicUrl.host || loopbackHosts.has(host ?? ''),
        'host-not-allowed',
        'Host 不受信任。',
        403,
      );
      if (path === '/healthz' && req.method === 'GET')
        return send(app.closing ? 503 : 200, {
          product: 'standalone-bot',
          schemaVersion: 1,
          status: app.closing ? 'stopping' : 'ok',
        });
      if (req.method !== 'GET') {
        requireValue(
          !req.headers.origin || req.headers.origin === publicUrl.origin,
          'origin-not-allowed',
          '请求来源不受信任。',
          403,
        );
        requireValue(
          !req.headers['sec-fetch-site'] ||
            ['same-origin', 'none'].includes(String(req.headers['sec-fetch-site'])),
          'cross-site-refused',
          '跨站请求已拒绝。',
          403,
        );
        requireValue(
          req.headers['content-type']?.split(';')[0] === 'application/json',
          'invalid-content-type',
          '请使用 JSON 请求。',
          415,
        );
      }
      const cookie =
        String(req.headers.cookie ?? '')
          .split(';')
          .map((x) => x.trim())
          .find((x) => x.startsWith('bot_session='))
          ?.slice(12) ?? '';
      const session = digest(cookie);
      const authenticated =
        !!cookie &&
        !!app.storage.db
          .prepare('SELECT digest FROM auth_sessions WHERE digest=? AND expires_at>?')
          .get(session, Date.now());
      async function body() {
        let size = 0;
        const chunks = [];
        for await (const chunk of req) {
          size += chunk.length;
          requireValue(size <= 49152, 'body-too-large', '请求内容过大。', 413);
          chunks.push(Buffer.from(chunk));
        }
        let value;
        try {
          value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        } catch {
          throw new BotError('invalid-json', 'JSON 格式无效。');
        }
        requireValue(
          value && typeof value === 'object' && !Array.isArray(value),
          'invalid-input',
          '请求对象无效。',
        );
        return value;
      }
      if (path === '/api/v1/session' && req.method === 'POST') {
        const ip = req.socket.remoteAddress ?? '';
        for (const [key, value] of attempts) if (value.until < Date.now()) attempts.delete(key);
        const attempt = attempts.get(ip) ?? { count: 0, until: Date.now() + 60000 };
        requireValue(
          attempt.count < 5 && attempts.size < 500,
          'login-rate-limited',
          '登录尝试过多，请稍后重试。',
          429,
        );
        attempt.count++;
        attempts.set(ip, attempt);
        const input = await body();
        const candidate = Buffer.from(digest(text(input.code, '访问码', 200)), 'hex');
        requireValue(timingSafeEqual(accessDigest, candidate), 'unauthorized', '访问码无效。', 401);
        attempts.delete(ip);
        const token = randomBytes(32).toString('base64url');
        app.storage.db.prepare('DELETE FROM auth_sessions WHERE expires_at<?').run(Date.now());
        app.storage.db
          .prepare('INSERT INTO auth_sessions(digest,expires_at) VALUES(?,?)')
          .run(digest(token), Date.now() + 86400000);
        res.setHeader(
          'set-cookie',
          `bot_session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=86400${publicUrl.protocol === 'https:' ? '; Secure' : ''}`,
        );
        return send(200, { authenticated: true });
      }
      if (path.startsWith('/api/')) {
        requireValue(authenticated, 'unauthorized', '请先登录。', 401);
        if (path === '/api/v1/session' && req.method === 'GET')
          return send(200, { authenticated: true });
        if (path === '/api/v1/logout' && req.method === 'POST') {
          app.storage.db.prepare('DELETE FROM auth_sessions WHERE digest=?').run(session);
          res.setHeader('set-cookie', 'bot_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0');
          return send(200, { authenticated: false });
        }
        requireValue(
          path === '/api/v1/command' && req.method === 'POST',
          'not-found',
          '接口不存在。',
          404,
        );
        const input = await body();
        requireValue(
          input.params === undefined ||
            (input.params && typeof input.params === 'object' && !Array.isArray(input.params)),
          'invalid-input',
          '命令参数无效。',
        );
        const command = text(input.command, '命令', 80);
        const result = await app.execute(command, input.params ?? {}, { kind: 'owner' });
        return send(command === 'runs.submit' ? 202 : 200, { schemaVersion: 1, result });
      }
      requireValue(req.method === 'GET', 'method-not-allowed', '此请求方法不受支持。', 405);
      const files: Record<string, [string, string]> = {
        '/': ['index.html', 'text/html'],
        '/app.js': ['app.js', 'text/javascript'],
        '/style.css': ['style.css', 'text/css'],
      };
      requireValue(Object.hasOwn(files, path), 'not-found', '页面不存在。', 404);
      const [file, mime] = files[path];
      res.setHeader('content-type', `${mime}; charset=utf-8`);
      res.end(readFileSync(join(staticRoot, file)));
    } catch (error) {
      const status = error instanceof BotError ? error.status : 500;
      send(status, publicError(error));
    }
  });
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  server.maxRequestsPerSocket = 100;
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port, options.host, resolve);
  });
  return {
    server,
    app,
    async close() {
      server.closeIdleConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await app.close();
    },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.BOT_PORT ?? 3080),
    host = process.env.BOT_HOST ?? '127.0.0.1';
  let runtime: Awaited<ReturnType<typeof startServer>> | undefined;
  try {
    runtime = await startServer({
      dataDir: process.env.BOT_DATA_DIR ?? './data',
      port,
      host,
      publicUrl: process.env.BOT_PUBLIC_URL ?? `http://127.0.0.1:${port}`,
    });
  } catch (error) {
    const code = error instanceof BotError ? error.code : 'startup-failed';
    process.stderr.write(`${JSON.stringify({ event: 'startup-failed', code })}\n`);
    process.exitCode = 1;
  }
  if (!runtime) process.exit();
  process.stdout.write(
    `${JSON.stringify({ event: 'listening', product: 'standalone-bot', port })}\n`,
  );
  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    await runtime.close();
  };
  process.on('SIGTERM', () => void stop());
  process.on('SIGINT', () => void stop());
}

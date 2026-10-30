import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';
import { startServer } from '../src/server.ts';

const roots = [];
const dir = () => { const path = mkdtempSync(join(tmpdir(), 'browser-product-')); roots.push(path); return path; };
after(() => { for (const path of roots) rmSync(path, { recursive: true, force: true }); });

const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n += 1) { let c = n; for (let i = 0; i < 8; i += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcTable[n] = c >>> 0; }
function crc32(bytes) { let crc = 0xffffffff; for (const byte of bytes) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8); return (crc ^ 0xffffffff) >>> 0; }
function chunk(type, data) { const name = Buffer.from(type); const out = Buffer.alloc(data.length + 12); out.writeUInt32BE(data.length); name.copy(out, 4); data.copy(out, 8); out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length); return out; }
function png() { const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(1, 0); ihdr.writeUInt32BE(1, 4); ihdr[8] = 8; ihdr[9] = 6; return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(Buffer.from([0,20,30,40,255]))), chunk('IEND', Buffer.alloc(0))]); }
function sendJson(res, status, body) { const bytes = Buffer.from(JSON.stringify(body)); res.writeHead(status, { 'content-type': 'application/json', 'content-length': bytes.length }); res.end(bytes); }
function cli(base, sessionFile, args, input) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--experimental-strip-types', 'src/cli.ts', ...args], {
      cwd: new URL('..', import.meta.url),
      env: { ...process.env, BOT_URL: base, BOT_SESSION_FILE: sessionFile },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '', stderr = '';
    child.stdout.on('data', (value) => { stdout += value; });
    child.stderr.on('data', (value) => { stderr += value; });
    child.once('error', reject);
    child.once('exit', (code) => {
      try { resolve({ code, body: JSON.parse(stdout), stdout, stderr }); }
      catch { reject(new Error(`CLI response was not JSON (code ${code}, stdout ${JSON.stringify(stdout)}): ${stderr}`)); }
    });
    child.stdin.end(input ? JSON.stringify(input) : undefined);
  });
}

test('browser owner API, UI, canonical task trace, protected PNG and CLI share one path', async () => {
  const root = dir(), workerSocket = join(root, 'browser-worker.sock');
  const worker = createServer(async (req, res) => {
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {};
    if (req.url === '/v1/sessions' && req.method === 'POST')
      return sendJson(res, 201, { operationId: body.operationId, sessionId: 'remote-session', taskId: body.taskId, expiresAt: Date.now() + body.leaseMs, stepBudget: 12 });
    if (req.url === '/v1/sessions/remote-session/operations' && req.method === 'POST') {
      const result = body.action === 'screenshot' ? { resourceId: 'remote-image' } : { action: body.action, accepted: true };
      return sendJson(res, 200, { sessionId: 'remote-session', taskId: body.taskId, operationId: body.operationId, sequence: body.sequence, status: 'completed', result });
    }
    if (req.url === '/v1/sessions/remote-session/screenshots/remote-image') { res.writeHead(200, { 'content-type': 'image/png' }); return res.end(png()); }
    if (req.url === '/v1/sessions/remote-session/close' || req.url === '/v1/sessions/remote-session/cancel') return sendJson(res, 200, { status: 'closed' });
    return sendJson(res, 404, { error: { code: 'not-found' } });
  });
  await new Promise((resolve, reject) => { worker.once('error', reject); worker.listen(workerSocket, resolve); });
  const probe = createServer();
  await new Promise((resolve) => probe.listen(0, '127.0.0.1', resolve));
  const port = probe.address().port;
  await new Promise((resolve) => probe.close(resolve));
  const base = `http://127.0.0.1:${port}`;
  const runtime = await startServer({ dataDir: root, port, host: '127.0.0.1', publicUrl: base, browserSocketPath: workerSocket });
  const post = (path, body, cookie) => fetch(`${base}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body) });
  const command = async (name, params = {}, cookie) => {
    const response = await post('/api/v1/command', { command: name, params }, cookie);
    const body = await response.json();
    if (!response.ok) throw Object.assign(new Error(body.error?.message), { code: body.error?.code, status: response.status });
    return body.result;
  };
  try {
    assert.equal((await post('/api/v1/command', { command: 'browser.status' })).status, 401);
    const html = await (await fetch(base)).text();
    assert.match(html, /data-view="browser"/u);
    assert.match(html, /id="browser-origins"/u);
    assert.match(html, /id="browser-tasks"/u);
    assert.match(html, /id="browser-step-form"/u);
    assert.match(readFileSync(new URL('../public/app.js', import.meta.url), 'utf8'), /textContent/u);
    assert.match(readFileSync(new URL('../public/style.css', import.meta.url), 'utf8'), /browser-screenshot/u);

    const code = readFileSync(join(root, 'secrets', 'access-code'), 'utf8').trim();
    const login = await post('/api/v1/session', { code });
    assert.equal(login.status, 200);
    const cookie = login.headers.get('set-cookie').split(';')[0];
    const sessionFile = join(root, 'cli-session');
    writeFileSync(sessionFile, cookie, { mode: 0o600 });
    assert.deepEqual(await command('browser.status', {}, cookie), { configured: true, status: 'configured' });
    const bot = await command('main.get', {}, cookie).then((result) => result.bot);
    const other = await command('bots.create', { slug: 'browser-other', name: 'Other' }, cookie);
    await command('browser.origins.grant', { botId: bot.id, origin: 'https://example.test' }, cookie);
    await assert.rejects(command('browser.open', { botId: bot.id, origin: 'https://unapproved.test', idempotencyKey: 'denied-open' }, cookie), { code: 'browser-origin-not-authorized' });
    const opened = await command('browser.open', { botId: bot.id, origin: 'https://example.test', idempotencyKey: 'api-open' }, cookie);
    const taskId = opened.taskId, sessionId = opened.sessionId;
    for (const [stepId, action, args] of [
      ['nav', 'navigate', { url: 'https://example.test/' }],
      ['read', 'read', {}], ['click', 'click', { selector: '#go' }],
      ['type', 'type', { selector: '#input', text: 'text' }],
      ['scroll', 'scroll', { direction: 'down', pixels: 100 }],
    ]) {
      const step = await command('browser.step', { botId: bot.id, taskId, sessionId, stepId, action, args }, cookie);
      assert.equal(step.status, 'completed');
    }
    const screenshot = await command('browser.step', { botId: bot.id, taskId, sessionId, stepId: 'shot', action: 'screenshot', args: {} }, cookie);
    const resourceId = screenshot.result.resourceId;
    const shotPath = `/api/v1/browser-screenshots/${resourceId}?botId=${encodeURIComponent(bot.id)}&taskId=${encodeURIComponent(taskId)}`;
    assert.equal((await fetch(`${base}${shotPath}`)).status, 401);
    assert.equal((await fetch(`${base}${shotPath}`, { headers: { cookie } })).status, 200);
    const wrongScope = await fetch(`${base}/api/v1/browser-screenshots/${resourceId}?botId=${encodeURIComponent(other.id)}&taskId=${encodeURIComponent(taskId)}`, { headers: { cookie } });
    assert.equal(wrongScope.status, 404);
    const cliOutput = join(root, 'browser-shot.png');
    const cliResult = await cli(base, sessionFile, ['browser.screenshot', '--resource-id', resourceId, '--bot-id', bot.id, '--task-id', taskId, '--output-file', cliOutput]);
    assert.equal(cliResult.code, 0);
    assert.deepEqual(readFileSync(cliOutput), png());

    const raceSessionFile = join(root, 'cli-session-deleted-during-download');
    writeFileSync(raceSessionFile, cookie, { mode: 0o600 });
    let unexpectedPostCount = 0;
    const deletingServer = createServer((req, res) => {
      if (req.method === 'GET') {
        rmSync(raceSessionFile);
        res.writeHead(200, { 'content-type': 'image/png', 'content-length': png().length });
        res.end(png());
      } else {
        unexpectedPostCount += 1;
        sendJson(res, 200, { unexpected: true });
      }
    });
    await new Promise((resolve) => deletingServer.listen(0, '127.0.0.1', resolve));
    const deletingBase = `http://127.0.0.1:${deletingServer.address().port}`;
    const deletedSessionResult = await cli(deletingBase, raceSessionFile,
      ['browser.screenshot', '--resource-id', resourceId, '--bot-id', bot.id, '--task-id', taskId,
        '--output-file', join(root, 'browser-shot-after-session-delete.png')]);
    assert.equal(deletedSessionResult.code, 0);
    assert.equal(deletedSessionResult.stdout.trim().split('\n').length, 1);
    assert.deepEqual(deletedSessionResult.body, { saved: true, bytes: png().length });
    assert.equal(unexpectedPostCount, 0);
    await new Promise((resolve) => deletingServer.close(resolve));

    const oversizedSessionFile = join(root, 'cli-session-oversized-response');
    writeFileSync(oversizedSessionFile, cookie, { mode: 0o600 });
    let oversizedPostCount = 0, resolveOversizedClose;
    const oversizedClosed = new Promise((resolve) => { resolveOversizedClose = resolve; });
    const oversizedServer = createServer((req, res) => {
      if (req.method === 'GET') {
        res.once('close', resolveOversizedClose);
        res.writeHead(200, { 'content-type': 'image/png' });
        res.write(Buffer.alloc(2 * 1024 * 1024 + 1));
      } else {
        oversizedPostCount += 1;
        sendJson(res, 200, { unexpected: true });
      }
    });
    await new Promise((resolve) => oversizedServer.listen(0, '127.0.0.1', resolve));
    const oversizedBase = `http://127.0.0.1:${oversizedServer.address().port}`;
    const oversizedResult = await cli(oversizedBase, oversizedSessionFile,
      ['browser.screenshot', '--resource-id', resourceId, '--bot-id', bot.id, '--task-id', taskId,
        '--output-file', join(root, 'browser-shot-too-large.png')]);
    assert.equal(oversizedResult.code, 1);
    assert.equal(oversizedResult.stdout.trim().split('\n').length, 1);
    assert.equal(oversizedResult.body.error.code, 'browser-screenshot-too-large');
    await Promise.race([oversizedClosed, new Promise((_, reject) => setTimeout(() => reject(new Error('oversized screenshot response was not cancelled')), 2000))]);
    assert.equal(oversizedPostCount, 0);
    await new Promise((resolve) => oversizedServer.close(resolve));

    const cliTrace = await cli(base, sessionFile, ['browser.trace'], { botId: bot.id, taskId });
    assert.equal(cliTrace.code, 0);
    assert.equal(cliTrace.body.result.sessions[0].steps.length, 6);
    const trace = await command('browser.trace', { botId: bot.id, taskId }, cookie);
    assert.equal(trace.sessions[0].steps[5].result.result.resourceId, resourceId);
    await command('browser.close', { botId: bot.id, taskId, sessionId }, cookie);
    const completed = await command('browser.trace', { botId: bot.id, taskId }, cookie);
    assert.equal(completed.task.status, 'completed');
    assert.equal(completed.task.errorCode, null);
  } finally {
    await runtime.close();
    worker.closeAllConnections();
    await new Promise((resolve) => worker.close(resolve));
  }
});

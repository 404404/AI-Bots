import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { deflateSync } from 'node:zlib';
import { browserSchemaSql, BrowserService } from '../src/browser-service.ts';
import { BrowserClient } from '../src/browser-client.ts';

const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n += 1) { let c = n; for (let i = 0; i < 8; i += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcTable[n] = c >>> 0; }
function crc32(bytes) { let crc = 0xffffffff; for (const byte of bytes) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8); return (crc ^ 0xffffffff) >>> 0; }
function chunk(type, data) { const name = Buffer.from(type); const out = Buffer.alloc(data.length + 12); out.writeUInt32BE(data.length); name.copy(out, 4); data.copy(out, 8); out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length); return out; }
function png() {
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(1, 0); ihdr.writeUInt32BE(1, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(Buffer.from([0, 0, 0, 0, 255]))), chunk('IEND', Buffer.alloc(0))]);
}

let root, socketPath, db, storage, server, service, calls, taskRunning, currentTask, taskAdapter, delayCreate, signalCreateStarted, createStarted, ownerDeadlineOverride, delayOperate, signalOperateStarted, operationStarted, releaseOperate, wrongScopeReply, delayScreenshot, screenshotStarted, signalScreenshotStarted, releaseScreenshot;
const botId = 'bot-a';
const taskId = 'task-worker';

function setupSchema(database) {
  database.exec(`PRAGMA foreign_keys=ON;
    CREATE TABLE bots(id TEXT PRIMARY KEY);
    CREATE TABLE tasks(id TEXT PRIMARY KEY,root_id TEXT NOT NULL,parent_id TEXT,initiator_bot_id TEXT NOT NULL,executor_bot_id TEXT NOT NULL,status TEXT NOT NULL,deadline_at TEXT NOT NULL);
    INSERT INTO bots(id) VALUES('bot-a'),('bot-b');
    INSERT INTO tasks(id,root_id,parent_id,initiator_bot_id,executor_bot_id,status,deadline_at) VALUES
      ('task-owner','task-owner',NULL,'bot-a','bot-a','running','2999-01-01T00:00:00.000Z'),
      ('task-worker','task-root','task-root','bot-a','bot-a','running','2999-01-01T00:00:00.000Z'),
      ('task-other','task-root','task-root','bot-b','bot-b','running','2999-01-01T00:00:00.000Z');
    ${browserSchemaSql}`);
}

function json(res, status, body) { const bytes = Buffer.from(JSON.stringify(body)); res.writeHead(status, { 'content-type': 'application/json', 'content-length': bytes.length }); res.end(bytes); }

beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), 'browser-service-'));
  socketPath = join(root, 'worker.sock');
  db = new DatabaseSync(':memory:');
  setupSchema(db);
  storage = { db, transaction(fn) { db.exec('BEGIN IMMEDIATE'); try { const result = fn(); db.exec('COMMIT'); return result; } catch (error) { db.exec('ROLLBACK'); throw error; } } };
  calls = { create: 0, operate: 0, cancel: 0, close: 0, screenshots: 0, failOperate: false };
  delayCreate = false;
  createStarted = new Promise((resolve) => { signalCreateStarted = resolve; });
  ownerDeadlineOverride = null;
  delayOperate = false;
  releaseOperate = null;
  wrongScopeReply = false;
  delayScreenshot = false;
  releaseScreenshot = null;
  screenshotStarted = new Promise((resolve) => { signalScreenshotStarted = resolve; });
  operationStarted = new Promise((resolve) => { signalOperateStarted = resolve; });
  server = createServer(async (req, res) => {
    const chunks = []; for await (const data of req) chunks.push(data);
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {};
    if (req.url === '/v1/sessions' && req.method === 'POST') { calls.create++; if (delayCreate) { signalCreateStarted(); await new Promise((resolve) => setTimeout(resolve, 35)); } return json(res, 201, { operationId: body.operationId, sessionId: 'remote-session', taskId: body.taskId, expiresAt: Date.now() + body.leaseMs, stepBudget: 12 }); }
    if (req.url === '/v1/sessions/remote-session/operations' && req.method === 'POST') {
      calls.operate++;
      if (delayOperate) { signalOperateStarted(); await new Promise((resolve) => { releaseOperate = resolve; }); }
      if (calls.failOperate) { res.destroy(); return; }
      const result = body.action === 'screenshot' ? { resourceId: 'remote-resource', contentType: 'image/png', bytes: png().length } : { clicked: body.action === 'click' };
      return json(res, 200, { sessionId: wrongScopeReply ? 'wrong-session' : 'remote-session', taskId: body.taskId, operationId: body.operationId, sequence: body.sequence, status: 'completed', result });
    }
    if (req.url === '/v1/sessions/remote-session/screenshots/remote-resource') {
      calls.screenshots++;
      if (delayScreenshot) { signalScreenshotStarted(); await new Promise((resolve) => { releaseScreenshot = resolve; }); }
      res.writeHead(200, { 'content-type': 'image/png' }); return res.end(png());
    }
    if (req.url === '/v1/sessions/remote-session/cancel') { calls.cancel++; if (calls.failCancel) { res.destroy(); return; } return json(res, 200, { status: 'cancelled' }); }
    if (req.url === '/v1/sessions/remote-session/close') { calls.close++; return json(res, 200, { status: 'closed' }); }
    return json(res, 404, { error: { code: 'not-found' } });
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(socketPath, resolve); });
  const client = new BrowserClient({ socketPath });
  let ownerTaskCalls = 0;
  const tasks = {
    assertOwnerBot(id) { assert.equal(id, botId); },
    createOwnerRootTask(input) { ownerTaskCalls++; assert.equal(input.botId, botId); return { id: 'task-owner', botId, executorBotId: botId, parentId: null, status: 'running', deadlineAt: ownerDeadlineOverride ?? '2999-01-01T00:00:00.000Z' }; },
    finishOwnerRootTask(id, status) { db.prepare('UPDATE tasks SET status=? WHERE id=?').run(status, id); },
    interruptTask(id, code) { assert.equal(code, 'browser-step-interrupted'); taskRunning = false; calls.interruptTask = (calls.interruptTask ?? 0) + 1; db.prepare("UPDATE tasks SET status='interrupted' WHERE id=? AND status='running'").run(id); },
    resolveTask(id) {
      const row = db.prepare('SELECT * FROM tasks WHERE id=?').get(id);
      return row ? { id: row.id, botId: row.executor_bot_id, executorBotId: row.executor_bot_id, parentId: row.parent_id, status: row.status, deadlineAt: row.deadline_at } : undefined;
    },
    isCurrentExecutorTask(id, task) { return currentTask && id === currentTask.botId && task === currentTask.taskId; },
  };
  tasks.ownerTaskCalls = () => ownerTaskCalls;
  taskAdapter = tasks;
  service = new BrowserService({ storage, client, tasks });
  await service.grantOrigin({ botId, origin: 'https://fixture.example' });
  taskRunning = true;
  currentTask = { botId, taskId };
});

afterEach(async () => {
  await new Promise((resolve) => server?.close(resolve));
  db?.close();
  if (root) rmSync(root, { recursive: true, force: true });
});

test('requires the exported schema and never creates tables during construction', () => {
  const empty = new DatabaseSync(':memory:');
  const bareStorage = { db: empty, transaction(fn) { return fn(); } };
  assert.throws(() => new BrowserService({ storage: bareStorage, client: new BrowserClient({ socketPath }), tasks: {} }), { code: 'schema-upgrade-required' });
  assert.equal(empty.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type='table'").get().n, 0);
  empty.close();
});

test('owner grant uses canonical exact origins and increments revision on revoke/regrant', async () => {
  const first = service.listOriginGrants(botId).find((row) => row.origin === 'https://fixture.example');
  const revoked = await service.revokeOrigin({ botId, origin: 'https://fixture.example' });
  assert.equal(revoked.revision, first.revision + 1);
  assert.equal(revoked.granted, false);
  const granted = await service.grantOrigin({ botId, origin: 'https://fixture.example' });
  assert.equal(granted.revision, revoked.revision + 1);
  assert.throws(() => service.grantOrigin({ botId, origin: 'https://fixture.example/path' }), { code: 'invalid-browser-origin' });
});

test('worker open requires actual active child executor scope and an exact Bot grant', async () => {
  currentTask = null;
  assert.throws(() => service.openForWorker({ botId, taskId, idempotencyKey: 'worker-open-1', origin: 'https://fixture.example' }), { code: 'browser-task-scope-denied' });
  currentTask = { botId, taskId };
  assert.throws(() => service.openForWorker({ botId: 'bot-b', taskId, idempotencyKey: 'worker-open-2', origin: 'https://fixture.example' }), { code: 'browser-task-scope-denied' });
  assert.throws(() => service.openForWorker({ botId, taskId, idempotencyKey: 'worker-open-3', origin: 'https://not-granted.example' }), { code: 'browser-origin-not-authorized' });
  const opened = await service.openForWorker({ botId, taskId, idempotencyKey: 'worker-open-4', origin: 'https://fixture.example' });
  assert.equal(opened.status, 'active');
  assert.equal(calls.create, 1);
});

test('owner open creates no-model canonical task once and open replay does not create another session', async () => {
  const opened = await service.openForOwner({ botId, idempotencyKey: 'owner-open-key', origin: 'https://fixture.example' });
  const replay = await service.openForOwner({ botId, idempotencyKey: 'owner-open-key', origin: 'https://fixture.example' });
  assert.equal(replay.sessionId, opened.sessionId);
  assert.equal(replay.replayed, true);
  assert.equal(taskAdapter.ownerTaskCalls(), 2); // Task adapter is idempotent by the same key.
  assert.equal(calls.create, 1);
});

test('owner open idempotency conflict is read-only and leaves the original canonical task running', async () => {
  await service.grantOrigin({ botId, origin: 'https://second.example' });
  const first = await service.openForOwner({ botId, idempotencyKey: 'owner-conflict', origin: 'https://fixture.example' });
  await assert.rejects(service.openForOwner({ botId, idempotencyKey: 'owner-conflict', origin: 'https://second.example' }), { code: 'browser-open-id-conflict' });
  assert.equal(db.prepare('SELECT status FROM tasks WHERE id=?').get(first.taskId).status, 'running');
  assert.equal(calls.create, 1);
});

test('concurrent owner open replay shares the in-flight RPC and does not terminate its root task', async () => {
  delayCreate = true;
  const [first, second] = await Promise.all([
    service.openForOwner({ botId, idempotencyKey: 'owner-open-concurrent', origin: 'https://fixture.example' }),
    service.openForOwner({ botId, idempotencyKey: 'owner-open-concurrent', origin: 'https://fixture.example' }),
  ]);
  assert.equal(first.sessionId, second.sessionId);
  assert.equal(calls.create, 1);
  assert.equal(db.prepare('SELECT status FROM tasks WHERE id=?').get('task-owner').status, 'running');
});

test('owner root task is interrupted when capacity prevents session acceptance', async () => {
  const at = new Date().toISOString();
  const insert = db.prepare(`INSERT INTO browser_sessions(id,bot_id,task_id,open_kind,open_key,open_fingerprint,create_operation_id,origin,grant_revision,status,expires_at,created_at,updated_at)
    VALUES(?,?,?,'worker',?,?,?,'https://fixture.example',1,'active','2999-01-01T00:00:00.000Z',?,?)`);
  for (let index = 0; index < 4; index += 1) insert.run(`session-${index}`, botId, taskId, `filler-${index}`, `fp-${index}`, `create-${index}`, at, at);
  await assert.rejects(service.openForOwner({ botId, idempotencyKey: 'owner-capacity', origin: 'https://fixture.example' }), { code: 'browser-session-capacity' });
  assert.equal(db.prepare('SELECT status FROM tasks WHERE id=?').get('task-owner').status, 'interrupted');
  assert.equal(calls.create, 0);
});

test('owner root task is interrupted when its canonical deadline cannot fit a lease', async () => {
  ownerDeadlineOverride = new Date(Date.now() + 500).toISOString();
  await assert.rejects(service.openForOwner({ botId, idempotencyKey: 'owner-short-deadline', origin: 'https://fixture.example' }), { code: 'task-deadline-exceeded' });
  assert.equal(db.prepare('SELECT status FROM tasks WHERE id=?').get('task-owner').status, 'interrupted');
  assert.equal(calls.create, 0);
});

test('step intent is idempotent and a duplicate does not repeat worker action', async () => {
  const opened = await service.openForWorker({ botId, taskId, idempotencyKey: 'open-idem', origin: 'https://fixture.example' });
  const args = { selector: '#go' };
  const first = await service.step({ sessionId: opened.sessionId, botId, taskId, stepId: 'step-1', action: 'click', args });
  const replay = await service.step({ sessionId: opened.sessionId, botId, taskId, stepId: 'step-1', action: 'click', args: { selector: '#go' } });
  assert.equal(first.sequence, 1);
  assert.deepEqual(replay, first);
  assert.equal(calls.operate, 1);
  currentTask = null;
  await assert.rejects(service.step({ sessionId: opened.sessionId, botId, taskId, stepId: 'step-1', action: 'click', args }), { code: 'browser-task-scope-denied' });
  currentTask = { botId, taskId };
  await assert.rejects(service.step({ sessionId: opened.sessionId, botId, taskId, stepId: 'step-1', action: 'click', args: { selector: '#other' } }), { code: 'browser-step-id-conflict' });
});

test('uncertain worker result becomes interrupted and is never resent', async () => {
  const opened = await service.openForWorker({ botId, taskId, idempotencyKey: 'open-uncertain', origin: 'https://fixture.example' });
  calls.failOperate = true;
  await assert.rejects(service.step({ sessionId: opened.sessionId, botId, taskId, stepId: 'uncertain-1', action: 'click', args: { selector: '#go' } }), { code: 'browser-step-interrupted' });
  calls.failOperate = false;
  await assert.rejects(service.step({ sessionId: opened.sessionId, botId, taskId, stepId: 'uncertain-1', action: 'click', args: { selector: '#go' } }), { code: 'browser-step-interrupted' });
  await assert.rejects(service.step({ sessionId: opened.sessionId, botId, taskId, stepId: 'uncertain-2', action: 'click', args: { selector: '#go' } }), { code: 'browser-session-not-active' });
  currentTask = null;
  assert.throws(() => service.openForWorker({ botId, taskId, idempotencyKey: 'open-uncertain-retry', origin: 'https://fixture.example' }), { code: 'browser-task-scope-denied' });
  assert.equal(calls.operate, 1);
  assert.equal(calls.cancel, 1);
  assert.equal(calls.interruptTask, 1);
  assert.equal(db.prepare('SELECT status FROM tasks WHERE id=?').get(taskId).status, 'interrupted');
  assert.equal(db.prepare('SELECT status FROM browser_sessions WHERE id=?').get(opened.sessionId).status, 'interrupted');
});

test('wrong session scope in worker response is fatal and cannot become a completed step', async () => {
  const opened = await service.openForWorker({ botId, taskId, idempotencyKey: 'open-wrong-scope', origin: 'https://fixture.example' });
  wrongScopeReply = true;
  await assert.rejects(service.step({ sessionId: opened.sessionId, botId, taskId, stepId: 'wrong-scope-1', action: 'click', args: { selector: '#go' } }), { code: 'browser-step-interrupted' });
  assert.equal(db.prepare("SELECT status FROM browser_steps WHERE session_id=? AND step_id='wrong-scope-1'").get(opened.sessionId).status, 'interrupted');
  assert.equal(db.prepare('SELECT status FROM tasks WHERE id=?').get(taskId).status, 'interrupted');
});

test('revocation cancels an active worker lease and interrupts an in-flight step before returning', async () => {
  const opened = await service.openForWorker({ botId, taskId, idempotencyKey: 'open-revoke-inflight', origin: 'https://fixture.example' });
  delayOperate = true;
  const step = service.step({ sessionId: opened.sessionId, botId, taskId, stepId: 'revoked-step', action: 'click', args: { selector: '#go' } });
  await operationStarted;
  const revoked = await service.revokeOrigin({ botId, origin: 'https://fixture.example' });
  assert.deepEqual(revoked.cleanupPending, []);
  assert.equal(calls.cancel, 1);
  assert.equal(db.prepare('SELECT status FROM browser_sessions WHERE id=?').get(opened.sessionId).status, 'cancelled');
  assert.equal(db.prepare('SELECT status FROM tasks WHERE id=?').get(taskId).status, 'interrupted');
  releaseOperate();
  await assert.rejects(step, { code: 'browser-step-interrupted' });
  assert.equal(calls.operate, 1);
});

test('revocation of a creating session remains pending until the create RPC returns and is cancelled', async () => {
  delayCreate = true;
  const opening = service.openForWorker({ botId, taskId, idempotencyKey: 'open-revoke-creating', origin: 'https://fixture.example' });
  await createStarted;
  const revoked = await service.revokeOrigin({ botId, origin: 'https://fixture.example' });
  assert.equal(revoked.cleanupPending.length, 1);
  assert.equal(db.prepare("SELECT status FROM browser_sessions WHERE open_key='open-revoke-creating'").get().status, 'closing');
  await assert.rejects(opening, { code: 'browser-session-interrupted' });
  assert.equal(calls.cancel, 1);
  assert.equal(db.prepare("SELECT status FROM browser_sessions WHERE open_key='open-revoke-creating'").get().status, 'cancelled');
});

test('revocation reports an unreachable worker with its lease deadline and reaper closes it at expiry', async () => {
  let clock = Date.now();
  service.now = () => clock;
  const opened = await service.openForWorker({ botId, taskId, idempotencyKey: 'open-revoke-pending', origin: 'https://fixture.example' });
  calls.failCancel = true;
  const revoked = await service.revokeOrigin({ botId, origin: 'https://fixture.example' });
  assert.deepEqual(revoked.cleanupPending, [{ sessionId: opened.sessionId, leaseExpiresAt: opened.expiresAt }]);
  assert.equal(db.prepare('SELECT status FROM browser_sessions WHERE id=?').get(opened.sessionId).status, 'closing');
  clock = Date.parse(opened.expiresAt) + 1;
  assert.equal(await service.reap(), 1);
  assert.equal(db.prepare('SELECT status FROM browser_sessions WHERE id=?').get(opened.sessionId).status, 'expired');
});

test('screenshots are validated, stored as bounded BLOBs and read only by matching Bot/task after close', async () => {
  const opened = await service.openForWorker({ botId, taskId, idempotencyKey: 'open-shot', origin: 'https://fixture.example' });
  const result = await service.step({ sessionId: opened.sessionId, botId, taskId, stepId: 'shot-1', action: 'screenshot' });
  assert.equal(result.result.width, 1);
  assert.equal(calls.screenshots, 1);
  const bytes = service.readScreenshot({ resourceId: result.result.resourceId, botId, taskId });
  assert.deepEqual(bytes, png());
  assert.throws(() => service.readScreenshot({ resourceId: result.result.resourceId, botId: 'bot-b', taskId }));
  const assertOwnerBot = taskAdapter.assertOwnerBot;
  taskAdapter.assertOwnerBot = () => { throw Object.assign(new Error('not owner'), { code: 'owner-required' }); };
  assert.throws(() => service.readScreenshot({ resourceId: result.result.resourceId, botId, taskId }), { code: 'owner-required' });
  taskAdapter.assertOwnerBot = assertOwnerBot;
  await service.close({ sessionId: opened.sessionId, botId, taskId });
  assert.deepEqual(service.readScreenshot({ resourceId: result.result.resourceId, botId, taskId }), png());
});

test('cancel during screenshot fetch prevents late screenshot BLOB and step success', async () => {
  const opened = await service.openForWorker({ botId, taskId, idempotencyKey: 'open-shot-race', origin: 'https://fixture.example' });
  delayScreenshot = true;
  const pending = service.step({ sessionId: opened.sessionId, botId, taskId, stepId: 'shot-race-1', action: 'screenshot' });
  await screenshotStarted;
  db.prepare("UPDATE tasks SET status='cancelled' WHERE id=?").run(taskId);
  await service.taskTerminal(taskId, 'cancelled');
  releaseScreenshot();
  await assert.rejects(pending, { code: 'browser-step-interrupted' });
  assert.equal(db.prepare('SELECT count(*) AS n FROM browser_screenshots WHERE session_id=?').get(opened.sessionId).n, 0);
  assert.equal(db.prepare("SELECT status FROM browser_steps WHERE session_id=? AND step_id='shot-race-1'").get(opened.sessionId).status, 'interrupted');
});

test('task completion conditionally closes the worker session and prevents further steps', async () => {
  const opened = await service.openForWorker({ botId, taskId, idempotencyKey: 'open-terminal', origin: 'https://fixture.example' });
  await service.taskTerminal(taskId, 'completed');
  assert.equal(calls.cancel, 1);
  assert.equal(db.prepare('SELECT status FROM browser_sessions WHERE id=?').get(opened.sessionId).status, 'closed');
  await assert.rejects(service.step({ sessionId: opened.sessionId, botId, taskId, stepId: 'late-1', action: 'click' }), { code: 'browser-session-not-active' });
});

test('expired leases are cancelled and owner task is ended through the canonical adapter', async () => {
  let clock = Date.now();
  service.now = () => clock;
  const opened = await service.openForOwner({ botId, idempotencyKey: 'owner-expire', origin: 'https://fixture.example' });
  clock += 121_000;
  assert.equal(await service.reap(), 1);
  assert.equal(calls.cancel, 1);
  assert.equal(db.prepare('SELECT status FROM browser_sessions WHERE id=?').get(opened.sessionId).status, 'expired');
  assert.equal(db.prepare('SELECT status FROM tasks WHERE id=?').get('task-owner').status, 'cancelled');
});

test('origin revision changes immediately retire every matching active session', async () => {
  const opened = await service.openForWorker({ botId, taskId, idempotencyKey: 'open-revoke', origin: 'https://fixture.example' });
  await service.revokeOrigin({ botId, origin: 'https://fixture.example' });
  assert.equal(calls.cancel, 1);
  assert.equal(db.prepare('SELECT status FROM browser_sessions WHERE id=?').get(opened.sessionId).status, 'cancelled');
  await assert.rejects(service.step({ sessionId: opened.sessionId, botId, taskId, stepId: 'after-revoke', action: 'click' }), { code: 'browser-session-not-active' });
});

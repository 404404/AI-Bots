import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { BotApplication } from '../src/application.ts';

const roots = [];
const directory = () => { const path = mkdtempSync(join(tmpdir(), 'employee-independent-')); roots.push(path); return path; };
after(() => { for (const path of roots) rmSync(path, { recursive: true, force: true }); });
const owner = (app, command, params = {}) => app.execute(command, params, { kind: 'owner' });

test('DE-06 history pages preserve the onboarding Conversation and every existing context', async () => {
  const app = new BotApplication(directory());
  try {
    const bot = await owner(app, 'bots.create', { slug: 'employee-history', name: 'Employee' });
    const other = await owner(app, 'bots.create', { slug: 'employee-other', name: 'Other' });
    const defaultChat = await owner(app, 'private-chat.open', { botId: bot.id });
    const conversations = [];
    for (let i = 0; i < 4; i++) conversations.push(await owner(app, 'conversations.create', { botId: bot.id }));
    const foreign = await owner(app, 'conversations.create', { botId: other.id });
    const db = app.storage.db;
    db.prepare('UPDATE conversations SET created_at=? WHERE bot_id=?').run('2026-01-01T00:00:00.000Z', bot.id);
    const [first, second] = await Promise.all([owner(app, 'private-chat.open', { botId: bot.id }), owner(app, 'private-chat.open', { botId: bot.id })]);
    assert.equal(first.conversation.id, defaultChat.conversation.id);
    assert.equal(second.conversation.id, first.conversation.id);
    const expectedIds = db.prepare('SELECT id FROM conversations WHERE bot_id=? ORDER BY seq').all(bot.id).map(x => x.id);
    let cursor; const ids = [];
    do { const page = await owner(app, 'private-chat.history', { botId: bot.id, limit: 1, cursor }); ids.push(...page.items.map(x => x.id)); cursor = page.nextCursor; } while (cursor);
    assert.deepEqual(ids, expectedIds);
    await owner(app, 'private-chat.select-conversation', { botId: bot.id, conversationId: conversations[0].id });
    assert.equal((await owner(app, 'private-chat.open', { botId: bot.id })).conversation.id, conversations[0].id);
    await assert.rejects(owner(app, 'private-chat.select-conversation', { botId: bot.id, conversationId: foreign.id }), { code: 'not-found' });
    assert.equal(db.prepare('SELECT count(*) n FROM conversations WHERE bot_id=?').get(bot.id).n, 5);
  } finally { await app.close(); }
});

test('DE-03 changing the shared model account invalidates the saved employee selection without fallback', async () => {
  const requests = [];
  const model = createServer(async (req, res) => { let body = ''; for await (const chunk of req) body += chunk; requests.push(body); res.end(JSON.stringify({ choices: [{ message: { content: 'synthetic' } }] })); });
  await new Promise(resolve => model.listen(0, '127.0.0.1', resolve));
  const app = new BotApplication(directory());
  try {
    const worker = await owner(app, 'bots.create', { slug: 'employee-worker', name: 'Worker' });
    const config = { provider: 'compatible', baseUrl: `http://127.0.0.1:${model.address().port}`, model: 'synthetic-model', keyless: true };
    await owner(app, 'model-account.update', config);
    const selection = { kind: 'global', modelId: config.model };
    const chat = await owner(app, 'private-chat.open', { botId: worker.id });
    assert.deepEqual(chat.selection, selection);
    await owner(app, 'bots.create', { slug: 'employee-ungranted', name: 'Other' });
    await owner(app, 'model-account.update', { ...config, model: 'replacement-model' });
    await assert.rejects(owner(app, 'runs.submit', { botId: worker.id, conversationId: chat.conversation.id,
      idempotencyKey: 'stale-global-selection', content: 'synthetic', selection }), { code: 'model-not-authorized' });
    assert.equal(requests.some((body) => body.includes('stale-global-selection')), false);
    assert.equal(app.storage.db.prepare('SELECT count(*) n FROM runs WHERE bot_id=? AND request_key=?').get(worker.id, 'stale-global-selection').n, 0);
  } finally { await app.close(); model.closeAllConnections(); await new Promise(resolve => model.close(resolve)); }
});

test('DE-03 an employee requires explicit global model selection and replays an accepted run', async () => {
  let calls = 0;
  const model = createServer(async (req, res) => {
    for await (const _ of req) {}
    calls++;
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ choices: [{ message: { content: 'synthetic reply' } }] }));
  });
  await new Promise(resolve => model.listen(0, '127.0.0.1', resolve));
  const app = new BotApplication(directory());
  try {
    const bot = await owner(app, 'bots.create', { slug: 'employee-explicit-local', name: 'Employee' });
    const chat = await owner(app, 'private-chat.open', { botId: bot.id });
    assert.equal(chat.selection, null);
    const params = { botId: bot.id, conversationId: chat.conversation.id, idempotencyKey: 'explicit', content: 'synthetic input' };
    await assert.rejects(owner(app, 'runs.submit', params), { code: 'model-selection-required' });
    assert.equal(calls, 0);
    await owner(app, 'model-account.update', { provider: 'compatible', baseUrl: `http://127.0.0.1:${model.address().port}`, model: 'synthetic-local', keyless: true });
    const selection = { kind: 'global', modelId: 'synthetic-local' };
    const run = await owner(app, 'runs.submit', { ...params, selection });
    await Promise.all([...app.active.values()].map(active => active.done));
    assert.equal(calls, 1);
    assert.equal((await owner(app, 'runs.submit', params)).id, run.id);
    assert.equal(calls, 1);
    await owner(app, 'private-chat.select-model', { botId: bot.id, selection });
    await owner(app, 'runs.submit', { ...params, idempotencyKey: 'saved' });
    await Promise.all([...app.active.values()].map(active => active.done));
    assert.equal(calls, 2);
  } finally { await app.close(); model.closeAllConnections(); await new Promise(resolve => model.close(resolve)); }
});

test('DE-10 timeline paginates equal timestamps with stable IDs and scoped cursors', async () => {
  const app = new BotApplication(directory());
  try {
    const bot = await owner(app, 'bots.create', { slug: 'employee-timeline', name: 'Employee' });
    const a = await owner(app, 'conversations.create', { botId: bot.id });
    const b = await owner(app, 'conversations.create', { botId: bot.id });
    const db = app.storage.db, at = '2026-01-01T00:00:00.000Z';
    const run = db.prepare("INSERT INTO runs(id,bot_id,conversation_id,request_key,input,status,created_at) VALUES(?,?,?,?,?,'completed',?)");
    const message = db.prepare("INSERT INTO messages(id,bot_id,conversation_id,run_id,role,content,created_at) VALUES(?,?,?,?,'user',?,?)");
    for (let i = 0; i < 7; i++) { const id = `run-${i}`; run.run(id, bot.id, a.id, `key-${i}`, 'input', at); message.run(`message-${i}`, bot.id, a.id, id, `content-${i}`, at); }
    const first = await owner(app, 'private-chat.timeline', { botId: bot.id, conversationId: a.id, limit: 2 });
    assert(first.nextCursor);
    await assert.rejects(owner(app, 'private-chat.timeline', { botId: bot.id, conversationId: b.id, limit: 2, cursor: first.nextCursor }), { code: 'invalid-cursor' });
    const ids = first.items.map(x => x.id); let cursor = first.nextCursor;
    while (cursor) { const page = await owner(app, 'private-chat.timeline', { botId: bot.id, conversationId: a.id, limit: 2, cursor }); ids.push(...page.items.map(x => x.id)); cursor = page.nextCursor; }
    assert.deepEqual(ids, Array.from({ length: 7 }, (_, i) => `message:message-${i}`));
    assert.equal(new Set(ids).size, 7);
    const backwards = await owner(app, 'private-chat.timeline', { botId: bot.id, conversationId: a.id, limit: 2, direction: 'backward' });
    assert.deepEqual(backwards.items.map(x => x.id), ids.slice(-2));
    await assert.rejects(owner(app, 'private-chat.timeline', { botId: bot.id, conversationId: a.id, limit: 2, cursor: backwards.nextCursor }), { code: 'invalid-cursor' });
    await assert.rejects(owner(app, 'private-chat.timeline', { botId: bot.id, conversationId: a.id, limit: 2, direction: 'backward', cursor: first.nextCursor }), { code: 'invalid-cursor' });
    let older = backwards.items.map(x => x.id); cursor = backwards.nextCursor;
    while (cursor) { const page = await owner(app, 'private-chat.timeline', { botId: bot.id, conversationId: a.id, limit: 2, direction: 'backward', cursor }); older = [...page.items.map(x => x.id), ...older]; cursor = page.nextCursor; }
    assert.deepEqual(older, ids);
    for (let i = 7; i < 1107; i++) { const id = `run-${i}`; run.run(id, bot.id, a.id, `key-${i}`, 'input', at); message.run(`message-${String(i).padStart(4, '0')}`, bot.id, a.id, id, `content-${i}`, at); }
    const allIds = db.prepare("SELECT 'message:'||id AS id FROM messages WHERE bot_id=? AND conversation_id=? ORDER BY created_at,id").all(bot.id, a.id).map(x => x.id);
    const latest = await owner(app, 'private-chat.timeline', { botId: bot.id, conversationId: a.id, limit: 100, direction: 'backward' });
    assert.deepEqual(latest.items.map(x => x.id), allIds.slice(-100));
    assert.equal(latest.hasMore, true);
  } finally { await app.close(); }
});

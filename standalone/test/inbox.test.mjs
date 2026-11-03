import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { BotApplication } from '../src/application.ts';

const roots = [];
const directory = () => { const path = mkdtempSync(join(tmpdir(), 'inbox-')); roots.push(path); return path; };
after(() => { for (const path of roots) rmSync(path, { recursive: true, force: true }); });
const owner = (app, command, params = {}) => app.execute(command, params, { kind: 'owner' });

function addEmployee(app, id, name) {
  const at = '2026-11-03T00:00:00.000Z';
  app.storage.db.prepare(`INSERT INTO bots(id,slug,name,persona,config,created_at,updated_at,kind)
    VALUES(?,?,?,'persona','{}',?,?,'employee')`).run(id, id, name, at, at);
}
function addPrivateMessage(app, botId, conversationId, runId, messageId, role, content, at) {
  const db = app.storage.db;
  db.prepare(`INSERT OR IGNORE INTO runs(id,bot_id,conversation_id,request_key,input,status,created_at)
    VALUES(?,?,?,?,?,'completed',?)`).run(runId, botId, conversationId, runId, content, at);
  db.prepare(`INSERT INTO messages(id,bot_id,conversation_id,run_id,role,content,created_at)
    VALUES(?,?,?,?,?,?,?)`).run(messageId, botId, conversationId, runId, role, content, at);
}

test('inbox projects real private and group messages, counts only Bot replies, and persists monotonic read cursors', async () => {
  const root = directory(); let app = new BotApplication(root);
  try {
    addEmployee(app, 'inbox-a', '甲'); addEmployee(app, 'inbox-b', '乙');
    const opened = await owner(app, 'private-chat.open', { botId: 'inbox-a' });
    const cid = opened.conversation.id, at = '2026-11-03T00:00:00.000Z';
    addPrivateMessage(app, 'inbox-a', cid, 'private-run-a', 'private-user-a', 'user', 'question', at);
    addPrivateMessage(app, 'inbox-a', cid, 'private-run-a', 'private-assistant-a', 'assistant', 'answer', '2026-11-03T00:00:00.001Z');
    const group = await owner(app, 'groups.create', { name: '项目群', memberBotIds: ['inbox-a', 'inbox-b'] });
    const gid = group.group.id;
    const db = app.storage.db;
    db.prepare(`INSERT INTO chat_group_messages(id,group_id,sender_type,sender_id,sender_name,content,created_at)
      VALUES(?,'${gid}','user','user','你','group question',?)`).run('group-user-a', at);
    db.prepare(`INSERT INTO chat_group_messages(id,group_id,sender_type,sender_id,sender_name,content,created_at)
      VALUES(?,'${gid}','bot','inbox-b','乙','group answer',?)`).run('group-bot-a', at);

    const result = await owner(app, 'inbox.list');
    assert.deepEqual(result.items.map(x => x.type).sort(), ['group', 'private']);
    const privateItem = result.items.find(x => x.type === 'private');
    const groupItem = result.items.find(x => x.type === 'group');
    assert.equal(privateItem.key, `private:${cid}`);
    assert.equal(privateItem.lastMessage.content, 'answer');
    assert.equal(privateItem.lastMessage.senderType, 'bot');
    assert.equal(privateItem.unreadCount, 1);
    assert.deepEqual(privateItem.unreadCursor, null);
    assert.equal(groupItem.lastMessage.id, 'group-bot-a');
    assert.equal(groupItem.lastMessage.senderId, 'inbox-b');
    assert.equal(groupItem.unreadCount, 1);
    assert.deepEqual(result.startChats, [{ botId: 'inbox-b', name: '乙' }]);

    const userSeq = db.prepare('SELECT seq FROM messages WHERE id=?').get('private-user-a').seq;
    const userAt = db.prepare('SELECT created_at FROM messages WHERE id=?').get('private-user-a').created_at;
    await owner(app, 'inbox.read', { type: 'private', id: cid, through: { id: 'private-user-a', createdAt: userAt } });
    assert.equal((await owner(app, 'inbox.list')).items.find(x => x.type === 'private').unreadCount, 1);
    const assistantAt = db.prepare('SELECT created_at FROM messages WHERE id=?').get('private-assistant-a').created_at;
    await owner(app, 'inbox.read', { type: 'private', id: cid, through: { id: 'private-assistant-a', createdAt: assistantAt } });
    assert.equal((await owner(app, 'inbox.list')).items.find(x => x.type === 'private').unreadCount, 0);
    await assert.rejects(owner(app, 'inbox.read', { type: 'private', id: cid,
      through: { id: 'private-user-a', createdAt: userAt } }), { code: 'read-cursor-regression' });
    assert(userSeq > 0);
    await assert.rejects(owner(app, 'inbox.read', { type: 'group', id: gid,
      through: { id: 'private-assistant-a', createdAt: assistantAt } }), { code: 'invalid-read-cursor' });
    await assert.rejects(owner(app, 'inbox.read', { type: 'group', id: gid,
      through: { id: 'missing-message', createdAt: at } }), { code: 'invalid-read-cursor' });
    await app.close(); app = new BotApplication(root);
    const reopened = await owner(app, 'inbox.list');
    assert.equal(reopened.items.find(x => x.type === 'private').unreadCount, 0);
    assert.equal(reopened.items.find(x => x.type === 'group').unreadCount, 1);
  } finally { await app.close(); }
});

test('inbox pinning is atomic, persistent, and stable keyset pages use real session boundaries', async () => {
  const root = directory(); let app = new BotApplication(root);
  try {
    addEmployee(app, 'inbox-c', '丙'); addEmployee(app, 'inbox-d', '丁');
    const c = await owner(app, 'private-chat.open', { botId: 'inbox-c' });
    const d = await owner(app, 'private-chat.open', { botId: 'inbox-d' });
    const group = await owner(app, 'groups.create', { name: '空群', memberBotIds: ['inbox-c'] });
    const baseline = await owner(app, 'inbox.list', { limit: 1 });
    assert.equal(baseline.items.length, 1); assert.equal(baseline.hasMore, true);
    assert(baseline.nextCursor);
    const all = await owner(app, 'inbox.list', { limit: 100 });
    assert.equal(all.items.length, 3);
    await owner(app, 'inbox.pin', { type: 'group', id: group.group.id, pinned: true });
    const ordered = await owner(app, 'inbox.list', { limit: 100 });
    assert.equal(ordered.items[0].groupId, group.group.id);
    assert.equal(ordered.items[0].pinned, true);
    await app.close(); app = new BotApplication(root);
    const reopened = await owner(app, 'inbox.list', { limit: 100 });
    assert.equal(reopened.items[0].groupId, group.group.id);
    assert.equal(reopened.items[0].pinned, true);
    await assert.rejects(owner(app, 'inbox.pin', { type: 'private', id: 'missing', pinned: true }), { code: 'conversation-not-found' });
    await assert.rejects(owner(app, 'inbox.list', { limit: 1, cursor: 'forged' }), { code: 'invalid-cursor' });

    const ids = []; let cursor;
    do { const page = await owner(app, 'inbox.list', { limit: 1, cursor }); ids.push(...page.items.map(x => x.key)); cursor = page.nextCursor; } while (cursor);
    assert.deepEqual(ids, ordered.items.map(x => x.key));
    assert.notEqual(c.conversation.id, d.conversation.id);
  } finally { await app.close(); }
});

test('private read-through follows seq when a same-millisecond Bot reply sorts before the read user UUID', async () => {
  const app = new BotApplication(directory());
  try {
    addEmployee(app, 'inbox-order', '顺序 Bot');
    const opened = await owner(app, 'private-chat.open', { botId: 'inbox-order' });
    const conversationId = opened.conversation.id, at = '2026-11-03T01:02:03.000Z';
    const laterUuid = 'f0000000-0000-4000-8000-000000000000';
    const earlierUuid = '00000000-0000-4000-8000-000000000000';
    addPrivateMessage(app, 'inbox-order', conversationId, 'order-run', laterUuid, 'user', 'first by seq', at);

    const timeline = await owner(app, 'private-chat.timeline', { botId: 'inbox-order', conversationId,
      direction: 'backward', limit: 1 });
    assert.equal(timeline.items[0].message.id, laterUuid, 'latest page returns the last persisted message');
    const through = timeline.items[0].message;
    await owner(app, 'inbox.read', { type: 'private', id: conversationId, through: { id: through.id, createdAt: through.createdAt } });
    addPrivateMessage(app, 'inbox-order', conversationId, 'order-run', earlierUuid, 'assistant', 'arrived after read', at);
    const item = (await owner(app, 'inbox.list')).items.find(x => x.id === conversationId);
    assert.equal(item.lastMessage.id, earlierUuid);
    assert.equal(item.unreadCount, 1, 'a later persisted Bot reply remains unread despite its smaller UUID');
    const latest = await owner(app, 'private-chat.timeline', { botId: 'inbox-order', conversationId,
      direction: 'backward', limit: 1 });
    assert.equal(latest.items[0].message.id, earlierUuid, 'actual latest page exposes the Bot reply');
    await owner(app, 'inbox.read', { type: 'private', id: conversationId, through: latest.items[0].message });
    assert.equal((await owner(app, 'inbox.list')).items.find(x => x.id === conversationId).unreadCount, 0,
      'marking the actually displayed latest message read clears unread');
    await assert.rejects(owner(app, 'inbox.read', { type: 'private', id: conversationId,
      through: { id: laterUuid, createdAt: at } }), { code: 'read-cursor-regression' });
  } finally { await app.close(); }
});

test('schema 10 migration retains real private and group messages', async () => {
  const root = directory(); let app = new BotApplication(root);
  addEmployee(app, 'inbox-migrate', '迁移 Bot');
  const opened = await owner(app, 'private-chat.open', { botId: 'inbox-migrate' });
  const at = '2026-11-03T02:00:00.000Z';
  addPrivateMessage(app, 'inbox-migrate', opened.conversation.id, 'migration-run', 'migration-private', 'assistant', 'existing private reply', at);
  const group = await owner(app, 'groups.create', { name: '旧群', memberBotIds: ['inbox-migrate'] });
  app.storage.db.prepare(`INSERT INTO chat_group_messages(id,group_id,sender_type,sender_id,sender_name,content,created_at)
    VALUES(? ,?,'bot',?,?,?,?)`).run('migration-group', group.group.id, 'inbox-migrate', '迁移 Bot', 'existing group reply', at);
  await app.close();

  const raw = new DatabaseSync(join(root, 'bot.sqlite'));
  raw.exec('DROP TABLE inbox_session_state; PRAGMA user_version=10');
  raw.close();
  app = new BotApplication(root);
  try {
    assert.equal(app.storage.db.prepare('PRAGMA user_version').get().user_version, 12);
    const list = await owner(app, 'inbox.list', { limit: 100 });
    assert.equal(list.items.find(x => x.type === 'private').lastMessage.content, 'existing private reply');
    assert.equal(list.items.find(x => x.type === 'group').lastMessage.content, 'existing group reply');
  } finally { await app.close(); }
});

test('schema 10 inbox DDL conflict rolls back without damaging either message history', async () => {
  const root = directory(); let app = new BotApplication(root);
  addEmployee(app, 'inbox-conflict', '冲突 Bot');
  const opened = await owner(app, 'private-chat.open', { botId: 'inbox-conflict' });
  const at = '2026-11-03T03:00:00.000Z';
  addPrivateMessage(app, 'inbox-conflict', opened.conversation.id, 'conflict-run', 'conflict-private', 'assistant', 'keep private', at);
  const group = await owner(app, 'groups.create', { name: '冲突群', memberBotIds: ['inbox-conflict'] });
  app.storage.db.prepare(`INSERT INTO chat_group_messages(id,group_id,sender_type,sender_id,sender_name,content,created_at)
    VALUES(? ,?,'bot',?,?,?,?)`).run('conflict-group', group.group.id, 'inbox-conflict', '冲突 Bot', 'keep group', at);
  await app.close();

  const raw = new DatabaseSync(join(root, 'bot.sqlite'));
  raw.exec('DROP TABLE inbox_session_state; CREATE TABLE inbox_session_state(blocker TEXT); PRAGMA user_version=10');
  raw.close();
  assert.throws(() => new BotApplication(root), { code: 'schema-migration-failed' });
  const inspect = new DatabaseSync(join(root, 'bot.sqlite'));
  assert.equal(inspect.prepare('PRAGMA user_version').get().user_version, 10);
  assert.equal(inspect.prepare('SELECT content FROM messages WHERE id=?').get('conflict-private').content, 'keep private');
  assert.equal(inspect.prepare('SELECT content FROM chat_group_messages WHERE id=?').get('conflict-group').content, 'keep group');
  inspect.exec('DROP TABLE inbox_session_state'); inspect.close();

  app = new BotApplication(root);
  try { assert.equal(app.storage.db.prepare('PRAGMA user_version').get().user_version, 12); }
  finally { await app.close(); }
});

test('inbox commands are owner-only and exposed through the shared CLI command contract', async () => {
  const app = new BotApplication(directory());
  try {
    await assert.rejects(app.execute('inbox.list', {}, { kind: 'bot', botId: 'any' }), { code: 'forbidden' });
    const help = JSON.parse(execFileSync(process.execPath, ['--experimental-strip-types', fileURLToPath(new URL('../src/cli.ts', import.meta.url)), '--help'],
      { cwd: process.cwd(), encoding: 'utf8' }));
    assert(help.commands.includes('inbox.list'));
    assert(help.commands.includes('inbox.pin'));
    assert(help.commands.includes('inbox.read'));
  } finally { await app.close(); }
});

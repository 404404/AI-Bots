import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { BotApplication } from '../src/application.ts';
import { DatabaseSync } from 'node:sqlite';
import { migrate } from '../src/migrations.ts';

const roots = [];
const directory = () => { const path = mkdtempSync(join(tmpdir(), 'single-user-business-')); roots.push(path); return path; };
after(() => { for (const path of roots) rmSync(path, { recursive: true, force: true }); });
const owner = (app, command, params = {}) => app.execute(command, params, { kind: 'owner' });

test('fresh database starts with zero visible employees; owner creation persists one idempotent preset welcome', async () => {
  const app = new BotApplication(directory());
  try {
    assert.equal((await owner(app, 'bots.list')).items.length, 0);
    assert.deepEqual(await owner(app, 'contacts.get'), { count: 0, primaryEmployeeId: null, needsSelection: false, explicitlySelected: false });
    const params = { slug: 'field-analyst', name: 'Field Analyst', idempotencyKey: 'create-field-analyst' };
    const created = await owner(app, 'bots.create', params);
    assert.equal(created.id, created.bot.id);
    assert.equal(created.onboarding.roleStatus, 'pending');
    assert.equal(created.onboarding.welcome.kind, 'preset-welcome');
    const welcome = app.storage.db.prepare('SELECT content FROM messages WHERE id=?').get(created.onboarding.welcome.messageId).content;
    assert.match(welcome, /你希望我具体承担什么工作/u);
    assert.equal((await owner(app, 'contacts.get')).primaryEmployeeId, created.id);
    const replay = await owner(app, 'bots.create', params);
    assert.equal(replay.id, created.id);
    const welcomeRows = app.storage.db.prepare("SELECT content FROM messages WHERE bot_id=? AND role='assistant'").all(created.id);
    assert.equal(welcomeRows.length, 1);
    assert.equal(app.storage.db.prepare('SELECT count(*) n FROM conversations WHERE bot_id=?').get(created.id).n, 1);
  } finally { await app.close(); }
});

test('employee create transaction rolls back bot, conversation, welcome and idempotency record together', async () => {
  const app = new BotApplication(directory());
  try {
    app.storage.db.exec("CREATE TRIGGER fail_create_operation BEFORE INSERT ON employee_create_operations BEGIN SELECT RAISE(ABORT,'synthetic failure'); END");
    await assert.rejects(owner(app, 'bots.create', { name: 'Atomic', idempotencyKey: 'atomic-create' }));
    assert.equal(app.storage.db.prepare("SELECT count(*) n FROM bots WHERE kind='employee'").get().n, 0);
    assert.equal(app.storage.db.prepare('SELECT count(*) n FROM conversations').get().n, 0);
    assert.equal(app.storage.db.prepare('SELECT count(*) n FROM employee_onboarding').get().n, 0);
    app.storage.db.exec('DROP TRIGGER fail_create_operation');
    const created = await owner(app, 'bots.create', { name: 'Atomic', idempotencyKey: 'atomic-create' });
    assert.equal(created.bot.name, 'Atomic');
  } finally { await app.close(); }
});

test('global model and contact are shared; forged management tool is rejected even with legacy policy enabled', async () => {
  const app = new BotApplication(directory());
  try {
    const first = await owner(app, 'bots.create', { slug: 'first-contact', name: 'First' });
    await owner(app, 'model-account.update', { provider: 'compatible', model: 'synthetic-model', baseUrl: 'http://127.0.0.1:9', keyless: true });
    const second = await owner(app, 'bots.create', { slug: 'second-contact', name: 'Second' });
    assert.equal((await owner(app, 'contacts.get')).primaryEmployeeId, null);
    assert.equal((await owner(app, 'private-chat.models', { botId: first.id })).items[0].selection.modelId, 'synthetic-model');
    assert.equal((await owner(app, 'private-chat.models', { botId: second.id })).items[0].selection.modelId, 'synthetic-model');
    await assert.rejects(app.execute('contacts.get', {}, { kind: 'bot', botId: first.id }), { code: 'forbidden' });
    await owner(app, 'contacts.set-primary', { employeeId: second.id });
    assert.equal((await owner(app, 'contacts.get')).primaryEmployeeId, second.id);

    app.storage.db.prepare("UPDATE worker_management_policy SET enabled=1,allow_creation=1,updated_at=datetime('now') WHERE singleton=1").run();
    const task = app.tasks.store.createRoot({ executorBotId: first.id, initiatorBotId: first.id, requestKey: 'forged', input: 'x', configRevision: 1,
      configSnapshot: '{}', memorySnapshot: '[]', deadlineAt: new Date(Date.now() + 60000).toISOString(), at: new Date().toISOString() }).task;
    app.tasks.store.begin(task.id, new Date().toISOString());
    const scope = app.tasks.scope(first.id, task.id);
    const result = await app.tasks.executeTool(scope, { id: 'forged-create', name: 'create_worker', arguments: { name: 'No', persona: 'No', connectionId: 'x' } }, new AbortController().signal);
    assert.equal(result.isError, true);
    assert.equal(app.storage.db.prepare("SELECT count(*) n FROM bots WHERE kind='employee'").get().n, 2);
    await assert.rejects(owner(app, 'bots.update', { botId: first.id, name: 'First', model: { model: 'evil' } }), { code: 'model-account-only' });
  } finally { await app.close(); }
});

test('schema 8 migration adopts only one unambiguous OAuth source and retains every source row on conflict', () => {
  const makeSchema8 = (oauthIds) => {
    const db = new DatabaseSync(':memory:');
    db.exec(`CREATE TABLE bots(seq INTEGER PRIMARY KEY AUTOINCREMENT,id TEXT UNIQUE NOT NULL,slug TEXT UNIQUE NOT NULL,name TEXT NOT NULL,persona TEXT NOT NULL,config TEXT NOT NULL,credential TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,config_revision INTEGER NOT NULL DEFAULT 1,model_epoch INTEGER NOT NULL DEFAULT 1);
      CREATE TABLE oauth_credentials(bot_id TEXT PRIMARY KEY REFERENCES bots(id),credential TEXT NOT NULL);
      CREATE TABLE main_bot(singleton INTEGER PRIMARY KEY,bot_id TEXT NOT NULL REFERENCES bots(id));
      CREATE TABLE messages(id TEXT PRIMARY KEY);
      CREATE TABLE runs(id TEXT PRIMARY KEY);
      CREATE TABLE conversations(id TEXT PRIMARY KEY);
      CREATE TABLE private_chat_state(bot_id TEXT PRIMARY KEY,conversation_id TEXT);
      PRAGMA user_version=8;`);
    const at = new Date().toISOString();
    const insert = db.prepare('INSERT INTO bots(id,slug,name,persona,config,credential,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)');
    for (let i = 0; i < 3; i++) insert.run(`legacy-${i}`, `legacy-${i}`, `Legacy ${i}`, 'historical', JSON.stringify({provider:'openai-codex',model:'codex-synthetic',baseUrl:'https://chatgpt.com/backend-api'}), null, at, at);
    db.prepare('INSERT INTO main_bot(singleton,bot_id) VALUES(1,?)').run('legacy-0');
    const oauth = db.prepare('INSERT INTO oauth_credentials(bot_id,credential) VALUES(?,?)');
    for (const id of oauthIds) oauth.run(id, `encrypted-synthetic-${id}`);
    migrate(db);
    return db;
  };
  const single = makeSchema8(['legacy-0']);
  try {
    const adopted = single.prepare('SELECT oauth_credential,migration_state,selected_source_bot_id FROM model_account').get();
    assert.deepEqual({...adopted}, {oauth_credential:'encrypted-synthetic-legacy-0',migration_state:'ready',selected_source_bot_id:'legacy-0'});
    assert.equal(single.prepare('SELECT count(*) n FROM oauth_credentials').get().n, 1);
  } finally { single.close(); }
  const conflict = makeSchema8(['legacy-0','legacy-1']);
  try {
    const retained = conflict.prepare('SELECT oauth_credential,migration_state,selected_source_bot_id FROM model_account').get();
    assert.deepEqual({...retained}, {oauth_credential:null,migration_state:'selection-required',selected_source_bot_id:null});
    assert.equal(conflict.prepare('SELECT count(*) n FROM oauth_credentials').get().n, 2);
    assert.deepEqual(conflict.prepare('SELECT credential FROM oauth_credentials ORDER BY bot_id').all().map(x=>x.credential),
      ['encrypted-synthetic-legacy-0','encrypted-synthetic-legacy-1']);
  } finally { conflict.close(); }
});

test('owner task request uses the selected contact and delegates to another Bot without a grant', async () => {
  const upstream = createServer(async (req, res) => {
    for await (const _ of req) { /* consume synthetic request */ }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ choices: [{ message: { content: 'synthetic delegated result' } }] }));
  });
  await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve));
  const app = new BotApplication(directory());
  try {
    const contact = await owner(app, 'bots.create', { slug: 'task-contact', name: 'Contact' });
    const worker = await owner(app, 'bots.create', { slug: 'task-worker', name: 'Worker' });
    await owner(app, 'model-account.update', { provider: 'compatible', model: 'synthetic-model', baseUrl: `http://127.0.0.1:${upstream.address().port}`, keyless: true });
    await assert.rejects(owner(app, 'tasks.create', { workerBotId: worker.id, input: 'work', idempotencyKey: 'task-before-contact' }), { code: 'contact-selection-required' });
    await owner(app, 'contacts.set-primary', { employeeId: contact.id });
    const task = await owner(app, 'tasks.create', { workerBotId: worker.id, input: 'work', idempotencyKey: 'task-no-grant' });
    for (let i = 0; i < 100; i++) {
      const status = (await owner(app, 'tasks.get', { taskId: task.id })).root.status;
      if (status === 'completed') break;
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    const completed = await owner(app, 'tasks.get', { taskId: task.id });
    assert.equal(completed.root.status, 'completed');
    assert.equal(completed.root.result, 'synthetic delegated result');
    assert.equal(app.storage.db.prepare('SELECT count(*) n FROM delegation_grants').get().n, 0);
  } finally { await app.close(); upstream.closeAllConnections(); await new Promise(resolve => upstream.close(resolve)); }
});

test('group execution sends explicit sender IDs and names in untrusted model history', async () => {
  const requests = [];
  const upstream = createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    requests.push(JSON.parse(body));
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ choices: [{ message: { content: `reply-${requests.length}` } }] }));
  });
  await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve));
  const app = new BotApplication(directory());
  try {
    const first = await owner(app, 'bots.create', { slug: 'same-name-a', name: 'Same name' });
    const second = await owner(app, 'bots.create', { slug: 'same-name-b', name: 'Same name' });
    await owner(app, 'model-account.update', { provider: 'compatible', model: 'synthetic-model', baseUrl: `http://127.0.0.1:${upstream.address().port}`, keyless: true });
    const group = await owner(app, 'groups.create', { name: 'Synthetic group', memberBotIds: [first.id, second.id] });
    const sent = await owner(app, 'groups.send', { groupId: group.group.id, text: 'please collaborate', modelId: 'synthetic-model',
      recipientBotIds: [first.id, second.id], idempotencyKey: 'group-sender-proof' });
    for (let i = 0; i < 100; i++) {
      const states = sent.runs.map(run => app.groups.run(group.group.id, run.id).run.status);
      if (states.every(state => state === 'completed')) break;
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    assert.equal(requests.length, 2);
    const assistantHistory = requests[1].messages.find(message => message.role === 'assistant');
    const envelope = JSON.parse(assistantHistory.content);
    assert.deepEqual(envelope, { source:'untrusted-group-message',senderType:'bot',senderId:first.id,senderName:'Same name',content:'reply-1' });
  } finally { await app.close(); upstream.closeAllConnections(); await new Promise(resolve => upstream.close(resolve)); }
});

test('application close persists diagnostics for detached group run IDs before closing storage', async () => {
  const root = directory();
  const app = new BotApplication(root);
  app.groups.close = async () => ({ detachedRunIds: ['synthetic-detached-run-1', 'synthetic-detached-run-2'] });
  await app.close();
  const db = new DatabaseSync(join(root, 'bot.sqlite'));
  try {
    const rows = db.prepare("SELECT run_id,event,code FROM diagnostics WHERE event='group-execution-detached' ORDER BY run_id")
      .all().map(({ run_id, event, code }) => ({ run_id, event, code }));
    assert.deepEqual(rows, [
      { run_id: 'synthetic-detached-run-1', event: 'group-execution-detached', code: 'close-deadline' },
      { run_id: 'synthetic-detached-run-2', event: 'group-execution-detached', code: 'close-deadline' },
    ]);
  } finally { db.close(); }
});

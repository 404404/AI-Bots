import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes } from 'node:crypto';
import { BotApplication } from '../src/application.ts';

const dir = () => mkdtempSync(join(tmpdir(), 'standalone-main-'));

test('v3 creates one stable main Bot, exposes catalog, and rejects model context for owner operations', async () => {
  const app = new BotApplication(dir());
  try {
    const first = await app.executeOwner('main.get');
    assert.equal(first.bot.isMain, true);
    assert.equal((await app.executeOwner('main.get')).bot.id, first.bot.id);
    assert.equal(app.storage.db.prepare('PRAGMA user_version').get().user_version, 5);
    const catalog = await app.executeOwner('main.catalog');
    assert.equal(catalog.mainBotId, first.bot.id);
    assert.equal(catalog.items[0].role, 'main');
    const worker = await app.executeOwner('bots.create', {
      slug: 'regular-bot',
      name: 'Regular',
      isMain: true,
      actor: 'owner',
    });
    assert.equal(worker.isMain, false);
    await assert.rejects(app.execute('main.get'), { code: 'forbidden' });
    await assert.rejects(app.execute('main.get', {}, { kind: 'bot', botId: worker.id }), {
      code: 'forbidden',
    });
    await assert.rejects(
      app.execute('bots.update', { botId: worker.id, name: 'Escalated' }, { kind: 'bot', botId: worker.id }),
      { code: 'forbidden' },
    );
    assert.equal((await app.executeOwner('main.get')).bot.id, first.bot.id);
  } finally {
    await app.close();
  }
});

test('v1 migration preserves existing Bot IDs and data despite a reserved slug collision', async () => {
  const root = dir();
  let app = new BotApplication(root);
  const oldMainId = (await app.executeOwner('main.get')).bot.id;
  const original = await app.executeOwner('bots.create', { slug: 'legacy', name: 'Main Bot' });
  await app.executeOwner('bots.update', { botId: original.id, persona: 'legacy persona' });
  const conversation = await app.executeOwner('conversations.create', { botId: original.id, title: 'Legacy history' });
  const legacyCredential = app.storage.encrypt('synthetic-migration-secret');
  app.storage.db.exec('DELETE FROM main_bot');
  app.storage.db.prepare('DELETE FROM bots WHERE id=?').run(oldMainId);
  app.storage.db.prepare("UPDATE bots SET slug='main-bot',credential=? WHERE id=?").run(legacyCredential, original.id);
  await app.close();

  const raw = new DatabaseSync(join(root, 'bot.sqlite'));
  raw.exec(`
    DROP TABLE task_tool_calls;
    DROP TABLE tasks;
    DROP TABLE delegation_grants;
    DROP TABLE connection_grants;
    DROP TABLE model_connections;
    DROP TABLE bot_avatars;
    DROP TABLE main_bot;
    ALTER TABLE runs DROP COLUMN task_id;
    ALTER TABLE bots DROP COLUMN config_revision;
    ALTER TABLE bots DROP COLUMN model_epoch;
    ALTER TABLE runs DROP COLUMN config_snapshot;
    ALTER TABLE runs DROP COLUMN config_revision;
    ALTER TABLE diagnostics DROP COLUMN task_id;
    PRAGMA user_version=1;
  `);
  raw.close();

  app = new BotApplication(root);
  try {
    const preserved = await app.executeOwner('bots.get', { botId: original.id });
    assert.equal(preserved.id, original.id);
    assert.equal(preserved.slug, 'main-bot');
    assert.equal(preserved.name, 'Main Bot');
    assert.equal(preserved.persona, 'legacy persona');
    assert.equal(app.storage.decrypt(app.storage.db.prepare('SELECT credential FROM bots WHERE id=?').get(original.id).credential), 'synthetic-migration-secret');
    assert.equal((await app.executeOwner('conversations.list', { botId: original.id })).items[0].id, conversation.id);
    const main = (await app.executeOwner('main.get')).bot;
    assert.notEqual(main.id, original.id);
    assert.notEqual(main.slug, 'main-bot');
    assert.equal(app.storage.db.prepare('PRAGMA user_version').get().user_version, 5);
  } finally {
    await app.close();
  }
});

test('run captures revision and non-secret model and identity snapshot at submit time', async () => {
  const app = new BotApplication(dir());
  try {
    const bot = await app.executeOwner('bots.create', { slug: 'snapshot-bot', name: 'Before', persona: 'before persona' });
    await app.executeOwner('bots.update', {
      botId: bot.id,
      model: { baseUrl: 'http://127.0.0.1:9', model: 'first-model', keyless: true },
      apiKey: 'synthetic-secret-value-123',
    });
    const conversation = await app.executeOwner('conversations.create', { botId: bot.id });
    const run = await app.executeOwner('runs.submit', {
      botId: bot.id,
      conversationId: conversation.id,
      idempotencyKey: 'snapshot-run',
      content: 'hello',
    });
    const submitted = await app.executeOwner('runs.get', { botId: bot.id, runId: run.id });
    await app.executeOwner('bots.update', {
      botId: bot.id,
      name: 'After',
      persona: 'after persona',
      model: { baseUrl: 'http://127.0.0.1:10', model: 'second-model', keyless: true },
    });
    const later = await app.executeOwner('bots.get', { botId: bot.id });
    assert.equal(later.configRevision, submitted.configRevision + 1);
    assert.equal(submitted.configSnapshot.name, 'Before');
    assert.equal(submitted.configSnapshot.persona, 'before persona');
    assert.equal(submitted.configSnapshot.model.model, 'first-model');
    assert.equal(JSON.stringify(submitted.configSnapshot).includes('synthetic-secret-value-123'), false);
    assert.equal(JSON.stringify(submitted).includes('synthetic-secret-value-123'), false);
  } finally {
    await app.close();
  }
});

test('damaged singleton fails closed and releases the data directory lease', async () => {
  const root = dir();
  const first = new BotApplication(root);
  first.storage.db.exec('DELETE FROM main_bot');
  await first.close();
  assert.throws(() => new BotApplication(root), { code: 'main-bot-state-invalid' });
  const db = new DatabaseSync(join(root, 'bot.sqlite'));
  db.prepare('INSERT INTO main_bot(singleton,bot_id) SELECT 1,id FROM bots ORDER BY seq LIMIT 1').run();
  db.close();
  const recovered = new BotApplication(root);
  await recovered.close();
});

test('failed key initialization releases the data directory lease for a later recovery', async () => {
  const root = dir();
  mkdirSync(join(root, 'secrets'));
  writeFileSync(join(root, 'secrets', 'master.key'), Buffer.from('bad'));
  assert.throws(() => new BotApplication(root), { code: 'invalid-key-file' });
  writeFileSync(join(root, 'secrets', 'master.key'), randomBytes(32));
  const recovered = new BotApplication(root);
  await recovered.close();
});

test('failed v1 migration rolls back all DDL and releases the lease for retry', async () => {
  const root = dir();
  const app = new BotApplication(root);
  const mainId = (await app.executeOwner('main.get')).bot.id;
  app.storage.db.exec('DELETE FROM main_bot');
  app.storage.db.prepare('DELETE FROM bots WHERE id=?').run(mainId);
  await app.close();
  const db = new DatabaseSync(join(root, 'bot.sqlite'));
  db.exec(`
    DROP TABLE task_tool_calls;
    DROP TABLE tasks;
    DROP TABLE delegation_grants;
    DROP TABLE connection_grants;
    DROP TABLE model_connections;
    DROP TABLE bot_avatars;
    DROP TABLE main_bot;
    ALTER TABLE runs DROP COLUMN task_id;
    ALTER TABLE bots DROP COLUMN config_revision;
    ALTER TABLE bots DROP COLUMN model_epoch;
    ALTER TABLE runs DROP COLUMN config_snapshot;
    ALTER TABLE runs DROP COLUMN config_revision;
    ALTER TABLE diagnostics DROP COLUMN task_id;
    CREATE VIEW main_bot AS SELECT id AS bot_id FROM bots;
    PRAGMA user_version=1;
  `);
  db.close();

  assert.throws(() => new BotApplication(root));
  const afterFailure = new DatabaseSync(join(root, 'bot.sqlite'));
  assert.equal(afterFailure.prepare('PRAGMA user_version').get().user_version, 1);
  assert.equal(afterFailure.prepare("SELECT count(*) AS n FROM pragma_table_info('bots') WHERE name='config_revision'").get().n, 0);
  afterFailure.exec('DROP VIEW main_bot');
  afterFailure.close();
  const recovered = new BotApplication(root);
  await recovered.close();
});

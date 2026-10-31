import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BotApplication } from '../src/application.ts';
import { BrowserService } from '../src/browser-service.ts';

const roots = [];
const dir = () => {
  const path = mkdtempSync(join(tmpdir(), 'browser-task-adapter-'));
  roots.push(path);
  return path;
};
after(() => { for (const path of roots) rmSync(path, { recursive: true, force: true }); });
const owner = (app, command, params = {}) => app.execute(command, params, { kind: 'owner' });

test('owner-only browser methods require authenticated owner ALS, while executor scope remains task-bound', async () => {
  const app = new BotApplication(dir());
  try {
    const main = (await owner(app, 'main.get')).bot;
    const worker = await owner(app, 'bots.create', { slug: 'browser-worker', name: 'Worker' });
    assert.throws(() => app.browser.grantOrigin({ botId: worker.id, origin: 'https://fixture.example' }), { code: 'forbidden' });
    const originGrant = await owner(app, 'browser.origins.grant', { botId: worker.id, origin: 'https://fixture.example' });
    assert.equal(originGrant.granted, true);
    assert.throws(() => app.browser.readScreenshot({ resourceId: 'missing', botId: worker.id, taskId: 'missing' }), { code: 'forbidden' });

    const at = new Date().toISOString();
    const rootTask = app.tasks.store.createRoot({
      executorBotId: main.id,
      initiatorBotId: main.id,
      requestKey: `browser-adapter-root-${crypto.randomUUID()}`,
      input: 'fixture root',
      configRevision: main.configRevision,
      configSnapshot: '{}',
      deadlineAt: new Date(Date.now() + 60_000).toISOString(),
      at,
    }).task;
    app.tasks.store.begin(rootTask.id, at);
    const child = app.tasks.store.createChild({
      rootId: rootTask.id,
      parentId: rootTask.id,
      initiatorBotId: main.id,
      executorBotId: worker.id,
      requestKey: 'browser-adapter-child',
      input: 'fixture child',
      connectionId: null,
      configRevision: worker.configRevision,
      configSnapshot: '{}',
      memorySnapshot: '[]',
      deadlineAt: new Date(Date.now() + 50_000).toISOString(),
      at,
    }).task;
    app.tasks.store.begin(child.id, at);

    app.browser = new BrowserService({ storage: app.storage, tasks: app.browserTasks, client: {
      async create(input) { return { sessionId: 'fixture-session', taskId: input.taskId, operationId: input.operationId }; },
      async cancel() { return { status: 'cancelled' }; },
      async close() { return { status: 'closed' }; },
    } });
    await app.browserTasks.runAsOwner(async () => {
      assert.equal(app.browser.listOriginGrants(worker.id).length, 1);
      await Promise.resolve().then(() => app.browserTasks.runAsUntrusted(async () => {
        assert.throws(() => app.browser.listOriginGrants(worker.id), { code: 'forbidden' });
        await app.browserTasks.runAsExecutor(worker.id, child.id, async () => {
          assert.throws(() => app.browser.grantOrigin({ botId: worker.id, origin: 'https://other.example' }), { code: 'forbidden' });
          assert.throws(() => app.browser.readScreenshot({ resourceId: 'missing', botId: worker.id, taskId: child.id }), { code: 'forbidden' });
          const opened = await app.browser.openForWorker({ botId: worker.id, taskId: child.id, idempotencyKey: 'worker-open', origin: 'https://fixture.example' });
          assert.equal(opened.status, 'active');
        });
      }));
    });
    assert.throws(() => app.browser.readScreenshot({ resourceId: 'missing', botId: worker.id, taskId: child.id }), { code: 'forbidden' });
    assert.throws(() => app.browserTasks.assertOwnerBot(worker.id), { code: 'forbidden' });
  } finally {
    await app.close();
  }
});

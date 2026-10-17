import { setImmediate } from 'node:timers/promises';
import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';
import { writeFileSync } from 'node:fs';

import { Context, Service } from '@deepseek-ai/cordis';
import LocalCredentialProvider from '@deepseek-ai/dsh-credentials-local';
import { credentialRef } from '@deepseek-ai/dsh-credentials';
import { afterEach, expect, it, vi } from 'vitest';

import { apply, createCore, inject, name, type BotHarnessCore } from '../src/plugin.js';
import { attachOperationalModule } from '../src/database/owner.js';
import type { DshBotAgentAdapterOptions } from '../src/runtime/dsh-bot-agent-adapter.js';
import type { OrchestratorAgentRun } from '../src/runtime/bot-runtime.js';
import { createTempRoot } from './helpers.js';

const completed = vi.hoisted(() => vi.fn());
vi.mock('../src/runtime/dsh-bot-agent-adapter.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/runtime/dsh-bot-agent-adapter.js')>()),
  createDshBotAgentAdapter: (options: DshBotAgentAdapterOptions) => ({
    async runOrchestrator(run: OrchestratorAgentRun) {
      await options.prepareModelRoute?.(run.bot.slug, 'orchestrator');
      if (run.acceptNativeInput?.() === false) return;
      run.triage?.resolve({ ids: run.triage.current(), outcome: 'done' });
      completed(run);
    },
    async runAssignment() {},
    requestAssignment() {
      throw new Error('No Assignment expected');
    },
    async close() {},
  }),
}));

const contexts: Context[] = [];
afterEach(async () => {
  while (contexts.length) await contexts.pop()!.fiber.dispose();
  completed.mockClear();
  vi.unstubAllEnvs();
});

async function persistedDueSchedule(home: string): Promise<string> {
  const core = createCore({ dshHome: home });
  core.registry.create({ slug: 'ada', displayName: 'Ada' });
  core.channels.getOrCreateDm('ada', 'Ada');
  const preset = core.modelPresets.create({
    name: 'Synthetic route',
    orchestrator: { provider: 'official', model: 'synthetic' },
    assignmentDefault: { provider: 'official', model: 'synthetic' },
  });
  core.registry.applyModelPreset('ada', preset);
  const schedule = core.schedules.create(
    'ada',
    {
      title: 'Startup catch-up',
      prompt: 'Synthetic startup check',
      trigger: { kind: 'every', everySeconds: 3600 },
    },
    'human',
  );
  core.schedules.close();
  attachOperationalModule(core.operationalDatabase, 'startup-test').transaction((db) =>
    db
      .prepare(
        "UPDATE bot_schedules SET record_json = json_set(record_json, '$.scheduledAt', ?) WHERE schedule_id = ?",
      )
      .run(new Date(Date.now() - 1000).toISOString(), schedule.id),
  );
  await core.runtime.close();
  core.operationalDatabase.close();
  return schedule.id;
}

function scheduleFacts(home: string) {
  const database = new DatabaseSync(join(home, 'botharness', 'botharness.db'), { readOnly: true });
  try {
    return database
      .prepare(
        'SELECT f.source_event_id, a.attempt_state, a.handled_at, a.side_effect_started_at, a.last_error FROM bot_schedule_firings f JOIN inbox_admissions a USING(source_event_id)',
      )
      .all();
  } finally {
    database.close();
  }
}

function startup(home: string) {
  vi.stubEnv('DSH_HOME', home);
  const ctx = new Context();
  contexts.push(ctx);
  ctx.provide('tools', { register: () => () => undefined, guard: () => () => undefined });
  ctx.provide('systemPrompt', { section: () => () => undefined });
  ctx.provide('sessions', { list: () => [], get: () => undefined });
  ctx.provide('agents', { list: () => [] } as never);
  ctx.provide('agentDefaultModel', {
    currentSelection: () => ({ provider: 'official', model: 'synthetic' }),
  } as never);
  ctx.provide('llm', {
    listProviders: () => [{ id: 'official', name: 'Official' }],
    listConfigurableProviders: () => [
      { provider: 'official', settingsNs: 'native', settingsPath: [] },
    ],
    listModels: async () => [{ id: 'synthetic', name: 'Synthetic' }],
    resolveCallConfig: async () => ({}),
  } as never);
  ctx.provide('settings', {
    describe: () => [{ ns: 'native', value: { apiKeyEnv: 'SYNTHETIC_STARTUP_KEY' } }],
  } as never);
  const fiber = ctx.plugin({ name, inject, apply }, { enabled: true, telemetry: false });
  return { ctx, fiber };
}

it('defers persisted due catch-up until the real credentials Service exists, then handles one Source Event', async () => {
  const home = createTempRoot('bh-credential-startup-');
  const scheduleId = await persistedDueSchedule(home);
  writeFileSync(join(home, '.credentials.yaml'), 'SYNTHETIC_STARTUP_KEY: synthetic-test-value\n', {
    mode: 0o600,
  });
  const { ctx, fiber } = startup(home);
  let release!: () => void;
  const ready = new Promise<void>((resolve) => {
    release = resolve;
  });
  class DelayedCredentials extends LocalCredentialProvider {
    override async *[Service.init]() {
      await ready;
      yield* super[Service.init]();
    }
  }
  const provider = ctx.plugin(DelayedCredentials, { dshHome: home, watch: false });
  try {
    await setImmediate();
    expect(ctx.get('credentials')).toBeUndefined();
    expect(ctx.get('botharness')).toBeUndefined();
    expect(scheduleFacts(home)).toEqual([]);
    expect(completed).not.toHaveBeenCalled();
  } finally {
    release();
  }
  await provider.await();
  await fiber.await();
  const core = ctx.get('botharness') as BotHarnessCore;
  await core.runtime.whenIdle();
  expect(await ctx.credentials.describe(credentialRef('SYNTHETIC_STARTUP_KEY'))).toMatchObject({
    configured: true,
  });
  expect(completed).toHaveBeenCalledTimes(1);
  expect(scheduleFacts(home)).toEqual([
    expect.objectContaining({
      attempt_state: 'handled',
      handled_at: expect.any(String),
      last_error: null,
    }),
  ]);
  const sourceEventId = core.schedules.history('ada', scheduleId)[0]!.sourceEventId;
  core.schedules.tick();
  await core.runtime.whenIdle();
  expect(completed).toHaveBeenCalledTimes(1);
  expect(core.schedules.history('ada', scheduleId).map((row) => row.sourceEventId)).toEqual([
    sourceEventId,
  ]);
});

it('keeps the core and bridge available when the credentials Service has no key, while refusing model execution', async () => {
  const home = createTempRoot('bh-credential-missing-');
  const scheduleId = await persistedDueSchedule(home);
  const { ctx, fiber } = startup(home);
  const provider = ctx.plugin(LocalCredentialProvider, { dshHome: home, watch: false });
  await provider.await();
  await fiber.await();
  const core = ctx.get('botharness') as BotHarnessCore;
  expect(core).toBeDefined();
  expect(ctx.get('botharnessBridge')).toBeDefined();
  expect(core.registry.get('ada')).toBeDefined();
  await core.runtime.whenIdle();
  expect(await ctx.credentials.describe(credentialRef('SYNTHETIC_STARTUP_KEY'))).toMatchObject({
    configured: false,
  });
  expect(completed).not.toHaveBeenCalled();
  expect(core.schedules.history('ada', scheduleId)).toHaveLength(1);
  expect(scheduleFacts(home)).toEqual([
    expect.objectContaining({
      attempt_state: 'retryable',
      handled_at: null,
      side_effect_started_at: null,
      last_error: expect.stringContaining('no API key'),
    }),
  ]);
});

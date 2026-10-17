import { expect, it } from 'vitest';

import { createCore, type BotHarnessCore } from '../src/plugin.js';
import { attachOperationalModule } from '../src/database/owner.js';
import type { BotAgentAdapter } from '../src/runtime/bot-runtime.js';
import { createTempRoot } from './helpers.js';

async function stop(core: BotHarnessCore) {
  core.schedules.close();
  await core.runtime.close();
  core.operationalDatabase.close();
}

function facts(core: BotHarnessCore, sourceEventId: string) {
  return attachOperationalModule(core.operationalDatabase, 'recovery-test').read((db) =>
    db
      .prepare(
        'SELECT attempt_state, side_effect_started_at, observed_at, handled_at, last_error FROM inbox_admissions WHERE source_event_id = ?',
      )
      .get(sourceEventId),
  );
}

function due(core: BotHarnessCore, scheduleId: string) {
  attachOperationalModule(core.operationalDatabase, 'recovery-test').transaction((db) =>
    db
      .prepare(
        "UPDATE bot_schedules SET record_json = json_set(record_json, '$.scheduledAt', ?) WHERE schedule_id = ?",
      )
      .run(new Date(Date.now() - 1000).toISOString(), scheduleId),
  );
  core.schedules.tick();
}

it('recovers only safe canonical schedule work through the existing harvest and never permanently coalesces later occurrences', async () => {
  const home = createTempRoot('bh-schedule-recovery-');
  const failure = 'Native credentials service is unavailable';
  const failing: BotAgentAdapter = {
    async runOrchestrator() {
      throw new Error(failure);
    },
    async runAssignment() {},
    requestAssignment() {
      throw new Error('No Assignment expected');
    },
    async close() {},
  };
  const seed = createCore({ dshHome: home, agents: failing });
  seed.registry.create({ slug: 'ada', displayName: 'Ada' });
  seed.registry.create({ slug: 'paused', displayName: 'Paused' });
  seed.channels.getOrCreateDm('ada', 'Ada');
  seed.channels.getOrCreateDm('paused', 'Paused');
  const entries = new Map<string, { scheduleId: string; sourceEventId: string }>();
  for (const key of [
    'safe',
    'pending',
    'admission-effect',
    'source-effect',
    'uncertain',
    'orphan',
    'resolved',
    'snoozed',
    'paused',
  ]) {
    const slug = key === 'paused' ? 'paused' : 'ada';
    const task = seed.schedules.create(
      slug,
      { title: key, prompt: key, trigger: { kind: 'every', everySeconds: 3600 } },
      'human',
    );
    due(seed, task.id);
    await seed.runtime.whenIdle();
    const sourceEventId = seed.schedules.history(slug, task.id)[0]!.sourceEventId!;
    expect(facts(seed, sourceEventId)).toMatchObject({
      attempt_state: 'retryable',
      side_effect_started_at: null,
      last_error: expect.stringContaining(failure),
    });
    entries.set(key, { scheduleId: task.id, sourceEventId });
    seed.schedules.update(slug, task.id, { enabled: false }, 'human');
  }
  seed.schedules.close();
  const port = attachOperationalModule(seed.operationalDatabase, 'recovery-test');
  port.transaction((db) => {
    db.prepare(
      "UPDATE inbox_admissions SET attempt_state = 'pending' WHERE source_event_id = ?",
    ).run(entries.get('pending')!.sourceEventId);
    db.prepare(
      'UPDATE inbox_admissions SET side_effect_started_at = ? WHERE source_event_id = ?',
    ).run(new Date().toISOString(), entries.get('admission-effect')!.sourceEventId);
    db.prepare('UPDATE source_events SET side_effect_started_at = ? WHERE source_event_id = ?').run(
      new Date().toISOString(),
      entries.get('source-effect')!.sourceEventId,
    );
    db.prepare(
      "UPDATE inbox_admissions SET attempt_state = 'needs-repair' WHERE source_event_id = ?",
    ).run(entries.get('uncertain')!.sourceEventId);
    db.prepare('UPDATE inbox_admissions SET resolved_at = ? WHERE source_event_id = ?').run(
      new Date().toISOString(),
      entries.get('resolved')!.sourceEventId,
    );
    db.prepare('UPDATE inbox_admissions SET snoozed_until = ? WHERE source_event_id = ?').run(
      new Date(Date.now() + 86400000).toISOString(),
      entries.get('snoozed')!.sourceEventId,
    );
  });
  seed.schedules.remove('ada', entries.get('orphan')!.scheduleId, 'human');
  seed.registry.setPaused('paused', true);
  await stop(seed);

  const handled: string[] = [];
  const agents: BotAgentAdapter = {
    async runOrchestrator(run) {
      const ids = run.triage!.current();
      handled.push(...ids);
      run.acceptNativeInput?.();
      run.triage!.resolve({ ids, outcome: 'done' });
    },
    async runAssignment() {},
    requestAssignment() {
      throw new Error('No Assignment expected');
    },
    async close() {},
  };
  let core = createCore({ dshHome: home, agents });
  try {
    await core.runtime.whenIdle();
    const expected = ['safe', 'pending'].map((key) => entries.get(key)!.sourceEventId);
    expect(handled.sort()).toEqual(expected.sort());
    for (const id of expected)
      expect(facts(core, id)).toMatchObject({
        attempt_state: 'handled',
        handled_at: expect.any(String),
        last_error: null,
      });
    for (const key of [
      'admission-effect',
      'source-effect',
      'uncertain',
      'orphan',
      'resolved',
      'snoozed',
      'paused',
    ]) {
      expect(facts(core, entries.get(key)!.sourceEventId)).toMatchObject({
        handled_at: null,
        last_error: expect.stringContaining(failure),
      });
    }
    const safe = entries.get('safe')!;
    core.schedules.update('ada', safe.scheduleId, { enabled: true }, 'human');
    due(core, safe.scheduleId);
    await core.runtime.whenIdle();
    const history = core.schedules.history('ada', safe.scheduleId);
    expect(history).toHaveLength(2);
    expect(history.every((row) => row.state === 'handled')).toBe(true);
    expect(new Set(history.map((row) => row.sourceEventId)).size).toBe(2);
    expect(handled).toHaveLength(3);
    core.schedules.update('ada', safe.scheduleId, { enabled: false }, 'human');
  } finally {
    await stop(core);
  }
  core = createCore({ dshHome: home, agents });
  try {
    await core.runtime.whenIdle();
    expect(handled).toHaveLength(3);
  } finally {
    await stop(core);
  }
});

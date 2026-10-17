import { rmSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCore } from '../src/plugin.js';
import { createTobScheduleOperations } from '../src/tob/cli-schedule-operations.js';
import { startTobCliBroker } from '../src/tob/cli-broker.js';
import { parseAgentSchedules } from '../src/bots/cli-agent-schedules.js';
import { runBotCreateCli } from '../src/bots/bot-create-cli.js';
import { createTempRoot } from './helpers.js';
import { createFakeRosterDomain } from './roster-fixture.js';

const cleanup: Array<() => Promise<void>> = [];
afterEach(async () => {
  vi.useRealTimers();
  for (const close of cleanup.splice(0).reverse()) await close();
});
async function fixture() {
  const root = createTempRoot('tob-schedule-');
  const core = createCore({ dshHome: root });
  await core.roster.attach(createFakeRosterDomain().facility);
  cleanup.push(async () => {
    core.schedules.close();
    await core.runtime.close();
    core.externalMessaging.close();
    core.operationalDatabase.close();
    rmSync(root, { recursive: true, force: true });
  });
  expect(core.registry.create({ slug: 'writer', displayName: 'Writer' }).ok).toBe(true);
  const prepare = createTobScheduleOperations({
    schedules: core.schedules,
    registry: core.registry,
    isProtectedBot: (slug) => core.tob.isTob(slug),
  });
  const run = async (command: string, args: Record<string, unknown>) =>
    (await prepare(command, args))!.run(() => {});
  const snapshot = () =>
    run('schedules', { slug: 'writer' }) as Promise<{
      stateFingerprint: string;
      schedules: Array<{ id: string; stateFingerprint: string }>;
    }>;
  const create = async () => {
    const current = await snapshot();
    const args = {
      slug: 'writer',
      expectedState: current.stateFingerprint,
      operationKey: 'schedule-test-001',
      input: {
        title: 'Check',
        prompt: 'Reply only READY',
        trigger: { kind: 'every', everySeconds: 3600 },
      },
    };
    const result = (await run('schedule-create', args)) as {
      schedule: { id: string; stateFingerprint: string };
    };
    return { args, ...result };
  };
  return { core, root, prepare, run, snapshot, create };
}

describe('Tob schedule management', () => {
  it('reconciles creation, detects changed payload and never recreates deleted work', async () => {
    const f = await fixture();
    const created = await f.create();
    const replay = await f.prepare('schedule-create', created.args);
    expect(replay!.proposal).toBeUndefined();
    expect(await replay!.run(() => {})).toMatchObject({ schedule: { id: created.schedule.id } });
    expect(() =>
      f.prepare('schedule-create', {
        ...created.args,
        input: { ...created.args.input, title: 'other' },
      }),
    ).toThrow(expect.objectContaining({ code: 'operation-key-conflict' }));
    f.core.schedules.remove('writer', created.schedule.id, 'human');
    expect(() => f.prepare('schedule-create', created.args)).toThrow(
      expect.objectContaining({ code: 'schedule-creation-deleted' }),
    );
    expect((await f.snapshot()).schedules).toHaveLength(0);
  });
  it('recovers an identical one-time scoped request after its deadline', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-18T00:00:00.000Z'));
    const f = await fixture();
    const before = await f.snapshot();
    const args = {
      slug: 'writer',
      expectedState: before.stateFingerprint,
      operationKey: 'once-scoped-replay-001',
      input: {
        title: 'Once',
        prompt: 'Synthetic',
        trigger: { kind: 'once', date: '2026-10-18', time: '00:01', timeZone: 'UTC' },
      },
    };
    const created = await f.run('schedule-create', args);
    vi.setSystemTime(new Date('2026-10-18T00:02:00.000Z'));
    const replay = (await f.prepare('schedule-create', args))!;
    expect(replay.proposal).toBeUndefined();
    expect(await replay.run(() => {})).toEqual(created);
    expect((await f.snapshot()).schedules).toHaveLength(1);
  });
  it('refuses stale writes after review and expires authority before any side effect', async () => {
    const f = await fixture();
    const { schedule } = await f.create();
    const prepared = (await f.prepare('schedule-update', {
      slug: 'writer',
      id: schedule.id,
      expectedState: schedule.stateFingerprint,
      change: { enabled: false },
    }))!;
    expect(Object.isFrozen(prepared.proposal!.previousValue)).toBe(true);
    const effect = vi.fn();
    expect(() =>
      prepared.run(() => {
        throw new Error('expired');
      }, effect),
    ).toThrow('expired');
    expect(effect).not.toHaveBeenCalled();
    f.core.schedules.update('writer', schedule.id, { title: 'Human edit' }, 'human');
    expect(() => prepared.run(() => {}, effect)).toThrow(
      expect.objectContaining({ code: 'stale-schedule' }),
    );
    expect(effect).not.toHaveBeenCalled();
    expect(f.core.schedules.list('writer')[0]).toMatchObject({
      enabled: true,
      title: 'Human edit',
    });
  });
  it('guards the collection before creation while preserving existing schedules', async () => {
    const f = await fixture();
    const { args } = await f.create();
    expect(() =>
      f.prepare('schedule-create', { ...args, operationKey: 'schedule-test-002' }),
    ).toThrow(expect.objectContaining({ code: 'stale-schedule' }));
    expect((await f.snapshot()).schedules).toHaveLength(1);
  });
  it('preserves locks, permits a reviewed unlock-only action, and requires delete confirmation', async () => {
    const f = await fixture();
    const { schedule } = await f.create();
    f.core.schedules.update('writer', schedule.id, { locked: true }, 'human');
    const locked = (await f.snapshot()).schedules[0]!;
    const args = { slug: 'writer', id: locked.id, expectedState: locked.stateFingerprint };
    for (const command of ['schedule-delete', 'schedule-run-now', 'schedule-update']) {
      expect(() =>
        f.prepare(command, {
          ...args,
          ...(command === 'schedule-delete' ? { confirm: true } : {}),
          ...(command === 'schedule-update' ? { change: { title: 'bypass', locked: false } } : {}),
        }),
      ).toThrow(expect.objectContaining({ code: 'locked' }));
    }
    const unlocked = (await f.run('schedule-update', { ...args, change: { locked: false } })) as {
      schedule: { stateFingerprint: string };
    };
    expect(() =>
      f.prepare('schedule-delete', { ...args, expectedState: unlocked.schedule.stateFingerprint }),
    ).toThrow(expect.objectContaining({ code: 'confirmation-required' }));
    expect(
      await f.run('schedule-delete', {
        ...args,
        expectedState: unlocked.schedule.stateFingerprint,
        confirm: true,
      }),
    ).toEqual({ removed: true });
  });
  it('keeps Bot ownership and does not invalidate observed state on actual firing', async () => {
    const f = await fixture();
    const { schedule } = await f.create();
    f.core.registry.create({ slug: 'other', displayName: 'Other' });
    expect(() =>
      f.prepare('schedule-update', {
        slug: 'other',
        id: schedule.id,
        expectedState: schedule.stateFingerprint,
        change: { enabled: false },
      }),
    ).toThrow(expect.objectContaining({ code: 'unknown-schedule' }));
    const prepared = (await f.prepare('schedule-update', {
      slug: 'writer',
      id: schedule.id,
      expectedState: schedule.stateFingerprint,
      change: { enabled: false },
    }))!;
    f.core.schedules.runNow('writer', schedule.id);
    expect(await prepared.run(() => {})).toMatchObject({ schedule: { enabled: false } });
    expect(await f.run('schedule-history', { slug: 'writer', id: schedule.id })).toMatchObject({
      firings: [{ trigger: 'manual', scheduleId: schedule.id, sourceEventId: expect.any(String) }],
    });
  });
  it('reviews and preserves all UI trigger and edit fields', async () => {
    const f = await fixture();
    let { schedule } = await f.create();
    for (const trigger of [
      { kind: 'daily', time: '09:00', timeZone: 'Asia/Tokyo' },
      { kind: 'weekly', time: '10:00', timeZone: 'UTC', weekdays: [1, 5] },
      { kind: 'once', date: '2099-01-01', time: '11:00', timeZone: 'UTC' },
      { kind: 'cron', expression: '0 9 * * 1-5', timeZone: 'Asia/Tokyo' },
      { kind: 'every', everySeconds: 3600 },
    ]) {
      const result = (await f.run('schedule-update', {
        slug: 'writer',
        id: schedule.id,
        expectedState: schedule.stateFingerprint,
        change: { trigger, title: 'Updated', prompt: 'NEW', enabled: false },
      })) as { schedule: typeof schedule };
      schedule = result.schedule;
      expect(f.core.schedules.list('writer')[0]).toMatchObject({
        trigger,
        enabled: false,
        title: 'Updated',
        prompt: 'NEW',
      });
    }
  });
  it('runs scoped CLI discovery, creation, replay and pause through the real broker parser', async () => {
    const f = await fixture();
    const approve = vi.fn(async () => {});
    const broker = await startTobCliBroker({
      signal: new AbortController().signal,
      authorize() {},
      approve,
      prepareOperation: f.prepare,
      readSetting: () => ({ scope: 'global', value: 8, revision: 0 }),
      writeSetting: async () => {
        throw new Error('unexpected');
      },
    });
    cleanup.push(() => broker.close());
    const cli = async (...args: string[]) => {
      const output: string[] = [];
      const code = await runBotCreateCli(args, {
        env: { DEEPSEEKBOT_AGENT_ENDPOINT: broker.endpoint, DEEPSEEKBOT_AGENT_TOKEN: broker.token },
        stdout: (value) => output.push(value),
        stderr() {},
      });
      expect(code).toBe(0);
      expect(output).toHaveLength(1);
      return JSON.parse(output[0]!);
    };
    const before = await cli('schedules', 'writer');
    const args = [
      'schedule-create',
      'writer',
      '--title',
      'CLI test',
      '--prompt',
      'Synthetic only',
      '--every',
      '3600',
      '--expected-state',
      before.stateFingerprint,
      '--operation-key',
      'cli-test-schedule-001',
    ];
    const created = await cli(...args);
    expect(await cli(...args)).toEqual(created);
    expect(approve).toHaveBeenCalledOnce();
    const updated = await cli(
      'schedule-update',
      'writer',
      '--sid',
      created.schedule.id,
      '--expected-state',
      created.schedule.stateFingerprint,
      '--disabled',
    );
    expect(updated.schedule.enabled).toBe(false);
    expect(approve).toHaveBeenCalledTimes(2);
  });
  it('applies broker approval denial before any schedule mutation and preserves coded locked errors', async () => {
    const f = await fixture();
    const { schedule } = await f.create();
    const approve = vi.fn(async () => {
      throw new Error('denied');
    });
    const broker = await startTobCliBroker({
      signal: new AbortController().signal,
      authorize() {},
      approve,
      prepareOperation: f.prepare,
      readSetting: () => ({ scope: 'global', value: 8, revision: 0 }),
      writeSetting: async () => {
        throw new Error('unexpected');
      },
    });
    cleanup.push(() => broker.close());
    const invoke = async (command: string, args: unknown) =>
      (
        await fetch(broker.endpoint + '/invoke', {
          method: 'POST',
          headers: { authorization: 'Bearer ' + broker.token, 'content-type': 'application/json' },
          body: JSON.stringify({ command, args }),
        })
      ).json();
    expect(
      await invoke('schedule-update', {
        slug: 'writer',
        id: schedule.id,
        expectedState: schedule.stateFingerprint,
        change: { enabled: false },
      }),
    ).toMatchObject({ ok: false });
    expect(approve).toHaveBeenCalledOnce();
    expect(f.core.schedules.list('writer')[0]!.enabled).toBe(true);
    f.core.schedules.update('writer', schedule.id, { locked: true }, 'human');
    const locked = (await f.snapshot()).schedules[0]!;
    expect(
      await invoke('schedule-run-now', {
        slug: 'writer',
        id: locked.id,
        expectedState: locked.stateFingerprint,
      }),
    ).toMatchObject({ ok: false, error: { code: 'locked' } });
  });
});

describe('scoped schedule CLI parsing', () => {
  const state = 'a'.repeat(64);
  it('requires observed state and a stable creation key, rejects ambiguous triggers and unrelated flags', () => {
    const flags = {
      title: 'Daily',
      prompt: 'Check',
      daily: '09:00',
      timezone: 'Asia/Tokyo',
      'expected-state': state,
      'operation-key': 'daily-check-001',
    };
    expect(parseAgentSchedules('schedule-create', ['writer'], flags)).toMatchObject({
      command: 'schedule-create',
      write: true,
      args: {
        expectedState: state,
        operationKey: 'daily-check-001',
        input: { trigger: { kind: 'daily', timeZone: 'Asia/Tokyo' } },
      },
    });
    for (const values of [
      { ...flags, timezone: undefined },
      { ...flags, every: '60' },
      { ...flags, 'operation-key': undefined },
      { ...flags, 'expected-state': undefined },
      { ...flags, host: 'https://elsewhere.test' },
    ])
      expect(() => parseAgentSchedules('schedule-create', ['writer'], values)).toThrow();
    expect(() =>
      parseAgentSchedules('schedule-delete', ['writer'], { sid: 'id', 'expected-state': state }),
    ).toThrow();
  });
});

import { expect, it } from 'vitest';
import { mountOperationalDatabase } from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { createUsageProjection, type DshUsageSessionLog } from '../src/usage/usage.js';
import type { DshSessionEvent } from '../src/sessions/source.js';
import { createTempRoot, createTestOwnership, trackTestOwner } from './helpers.js';

const now = new Date('2026-10-18T12:34:56Z');
function setup() {
  const database = trackTestOwner(
    mountOperationalDatabase({
      dshHome: createTempRoot('bh-home-usage-'),
      schemaPlan: BOT_HARNESS_SCHEMA_PLAN,
    }),
  );
  const ownership = createTestOwnership({ root: { botSlug: 'ada', rootRole: 'orchestrator' } });
  const usage = createUsageProjection({ database, ownership, now: () => now });
  return { usage, ownership };
}
function event(seq: number, at: string, total?: number): DshSessionEvent {
  return {
    seq,
    type: 'assistant/message',
    time: Date.parse(at),
    data: { usage: total === undefined ? {} : { totalTokens: total } },
  };
}

it('uses exact rolling boundaries across midnight, excludes inherited/duplicate/replaced usage, and offers longer ranges', async () => {
  const { usage } = setup();
  const rows = [
    event(0, '2026-10-18T11:00:00Z', 999),
    event(1, '2026-10-17T12:34:55Z', 5),
    event(2, '2026-10-17T12:34:56Z', 11),
    event(3, '2026-10-18T12:34:55Z', 13),
    event(3, '2026-10-18T12:34:55Z', 13),
    event(4, '2026-10-18T12:34:56Z', 17),
    { ...event(5, '2026-10-18T11:00:00Z', 19), surfaceOp: 'replace' as const },
  ];
  const read = async (): Promise<DshUsageSessionLog> => ({ inheritedEventCount: 1, events: rows });
  expect(await usage.rolling('24h', read)).toMatchObject({
    from: '2026-10-17T12:34:56.000Z',
    to: now.toISOString(),
    totalTokens: 24,
    status: 'ready',
  });
  expect(await usage.rolling('7d', read)).toMatchObject({
    totalTokens: 29,
    from: '2026-10-11T12:34:56.000Z',
  });
  expect(await usage.rolling('30d', read)).toMatchObject({ from: '2026-09-18T12:34:56.000Z' });
});

it('never converts unknown or unreadable usage to zero, and labels reported lower bounds', async () => {
  const { usage } = setup();
  const unknown = event(1, '2026-10-18T11:00:00Z');
  expect(await usage.rolling('24h', async () => undefined)).toMatchObject({
    totalTokens: null,
    status: 'unknown',
  });
  expect(
    await usage.rolling('24h', async () => ({ inheritedEventCount: 0, events: [unknown] })),
  ).toMatchObject({ totalTokens: null, status: 'unknown' });
  expect(
    await usage.rolling('24h', async () => ({
      inheritedEventCount: 0,
      events: [unknown, event(2, '2026-10-18T11:01:00Z', 7)],
    })),
  ).toMatchObject({ totalTokens: 7, status: 'partial' });
  expect(
    await usage.rolling('24h', async () => ({ inheritedEventCount: 0, events: [] })),
  ).toMatchObject({ totalTokens: 0, status: 'ready' });
});

it('retains reconciliation/degraded quality and refuses to reuse counters after content retirement during a read', async () => {
  const { usage, ownership } = setup();
  let finish!: (log: DshUsageSessionLog | undefined) => void;
  const rebuild = usage.rebuild(
    ['root'],
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const read = async () => ({
    inheritedEventCount: 0,
    events: [event(1, '2026-10-18T11:00:00Z', 7)],
  });
  expect(await usage.rolling('24h', read)).toMatchObject({
    freshness: 'reconciling',
    status: 'partial',
    totalTokens: 7,
  });
  finish(undefined);
  await rebuild;
  expect(await usage.rolling('24h', read)).toMatchObject({
    freshness: 'degraded',
    status: 'partial',
  });
  ownership.claim({
    sessionId: 'later',
    botSlug: 'ada',
    rootRole: 'assignment',
    at: '2026-01-01T00:00:00Z',
  });
  expect(
    await usage.rolling('24h', async (id) => {
      if (id === 'later') usage.purgeBot('ada');
      return read();
    }),
  ).toMatchObject({ totalTokens: null, status: 'unknown' });
});

it('bounds canonical log reads and reports truncation rather than a complete zero', async () => {
  const { usage, ownership } = setup();
  for (let index = 0; index < 200; index++)
    ownership.claim({
      sessionId: 'session-' + index,
      botSlug: 'ada',
      rootRole: 'assignment',
      at: now.toISOString(),
    });
  let reads = 0;
  const result = await usage.rolling('24h', async () => {
    reads++;
    return { inheritedEventCount: 0, events: [] };
  });
  expect(reads).toBe(200);
  expect(result).toMatchObject({
    sessionsRead: 200,
    sessionsTotal: 201,
    totalTokens: null,
    status: 'unknown',
  });
});

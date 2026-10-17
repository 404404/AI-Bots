import { afterEach, expect, it, vi } from 'vitest';
import { attachOperationalModule, mountOperationalDatabase } from '../src/database/owner.js';
import { defineSchemaPlan } from '../src/database/schema.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { createSessionOwnership } from '../src/sessions/ownership.js';
import { createUsageProjection, type DshUsageSessionLog } from '../src/usage/usage.js';
import type { DshSessionEvent } from '../src/sessions/source.js';
import { createTempRoot, trackTestOwner } from './helpers.js';

const now = new Date('2026-10-18T12:34:56Z');
afterEach(() => vi.useRealTimers());
function open(home = createTempRoot('bh-home-usage-')) {
  const database = trackTestOwner(
    mountOperationalDatabase({ dshHome: home, schemaPlan: BOT_HARNESS_SCHEMA_PLAN }),
  );
  const port = attachOperationalModule(database, 'usage');
  const ownership = createSessionOwnership(attachOperationalModule(database, 'session-ownership'));
  if (!ownership.resolve('root'))
    ownership.claim({
      sessionId: 'root',
      botSlug: 'ada',
      rootRole: 'orchestrator',
      at: '2026-09-01T00:00:00Z',
    });
  const usage = createUsageProjection({ database, ownership, now: () => now });
  return { usage, ownership, database, port, home };
}
function event(seq: number, at: string, total?: number): DshSessionEvent {
  return {
    seq,
    type: 'assistant/message',
    time: Date.parse(at),
    data: { usage: total === undefined ? {} : { totalTokens: total } },
  };
}

it('uses exact rolling UTC boundaries across timezone offsets, excludes inherited/duplicate/replaced usage, and offers longer ranges', async () => {
  const { usage } = open();
  const rows = [
    event(0, '2026-10-18T11:00:00Z', 999),
    event(1, '2026-10-17T12:34:55Z', 5),
    event(2, '2026-10-17T21:34:56+09:00', 11),
    event(3, '2026-10-18T12:34:55Z', 13),
    event(3, '2026-10-18T12:34:55Z', 13),
    event(4, '2026-10-18T12:34:56Z', 17),
    { ...event(5, '2026-10-18T11:00:00Z', 19), surfaceOp: 'replace' },
  ];
  await usage.rebuild(['root'], async () => ({ inheritedEventCount: 1, events: rows }));
  expect(usage.rolling('24h')).toMatchObject({
    from: '2026-10-17T12:34:56.000Z',
    to: now.toISOString(),
    totalTokens: 24,
    status: 'ready',
  });
  expect(usage.rolling('7d')).toMatchObject({ totalTokens: 29, from: '2026-10-11T12:34:56.000Z' });
  expect(usage.rolling('30d')).toMatchObject({ from: '2026-09-18T12:34:56.000Z' });
});

it('never converts missing reported totals to zero and distinguishes an empty known range from partial lower bounds', () => {
  const { usage } = open();
  expect(usage.rolling('24h')).toMatchObject({ totalTokens: 0, status: 'ready' });
  usage.handleSessionEvent('root', event(1, '2026-10-18T11:00:00Z'));
  expect(usage.rolling('24h')).toMatchObject({ totalTokens: null, status: 'unknown' });
  usage.handleSessionEvent('root', event(2, '2026-10-18T11:01:00Z', 7));
  expect(usage.rolling('24h')).toMatchObject({ totalTokens: 7, status: 'partial' });
});

it('retains exact counters across content loss/restart, and purges them through the same owner without recounting retired roots', () => {
  const first = open();
  const sample = event(1, '2026-10-18T11:00:00Z', 7);
  first.usage.handleSessionEvent('root', sample);
  first.usage.handleSessionEvent('root', sample);
  first.ownership.markContentUnavailable();
  expect(first.usage.rolling('24h')).toMatchObject({ totalTokens: 7, records: 1, status: 'ready' });
  first.database.close();
  const second = open(first.home);
  expect(second.usage.rolling('24h')).toMatchObject({
    totalTokens: 7,
    records: 1,
    status: 'ready',
  });
  second.usage.purgeBot('ada');
  second.usage.handleSessionEvent('root', sample);
  expect(second.usage.rolling('24h')).toMatchObject({
    totalTokens: 0,
    records: 0,
    status: 'ready',
  });
});

it('preserves reconciliation/degraded quality independently of retained counters', async () => {
  const { usage } = open();
  usage.handleSessionEvent('root', event(1, '2026-10-18T11:00:00Z', 7));
  let finish!: (log: DshUsageSessionLog | undefined) => void;
  const rebuild = usage.rebuild(
    ['root'],
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  expect(usage.rolling('24h')).toMatchObject({
    freshness: 'reconciling',
    status: 'partial',
    totalTokens: 7,
  });
  finish(undefined);
  await rebuild;
  expect(usage.rolling('24h')).toMatchObject({
    freshness: 'degraded',
    status: 'partial',
    totalTokens: 7,
  });
});

it.each(['owned-only', 'retained'] as const)(
  'upgrades generation101 %s history without inventing precise coverage and enriches existing receipts through non-model reconciliation',
  async (history) => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(now);
    const home = createTempRoot('bh-home-usage-upgrade-');
    const old = trackTestOwner(
      mountOperationalDatabase({
        dshHome: home,
        schemaPlan: defineSchemaPlan(
          BOT_HARNESS_SCHEMA_PLAN.migrations.filter((migration) => migration.generation <= 101),
        ),
      }),
    );
    const ownership = createSessionOwnership(attachOperationalModule(old, 'session-ownership'));
    ownership.claim({
      sessionId: 'root',
      botSlug: 'ada',
      rootRole: 'orchestrator',
      at: '2026-09-01T00:00:00Z',
    });
    const usageModule = attachOperationalModule(old, 'usage');
    usageModule.transaction(
      (connection) => {
        connection
          .prepare('INSERT INTO usage_receipts(fingerprint, bot_slug) VALUES (?, ?)')
          .run('legacy', 'ada');
        connection
          .prepare(`INSERT INTO usage_daily(bot_slug,day,provider,model,purpose,input_tokens,output_tokens,cache_read_tokens,cache_write_tokens)
      VALUES ('ada','2026-10-18','p','m','orchestrator',10,0,0,0)`)
          .run();
      },
      ['usage'],
    );
    old.close();
    const current = open(home);
    expect(current.usage.rolling('24h')).toMatchObject({
      totalTokens: null,
      status: 'unknown',
      coverageStart: now.toISOString(),
    });
    const sample = event(1, '2026-10-18T11:00:00Z', 7);
    current.usage.handleSessionEvent('root', sample);
    const before = current.usage.activity('ada', '2000-01-01T00:00:00Z');
    current.port.transaction(
      (connection) =>
        connection
          .prepare(
            'UPDATE usage_receipts SET occurred_at_ms=NULL,total_tokens=NULL WHERE fingerprint != ?',
          )
          .run('legacy'),
      ['usage'],
    );
    expect(
      await current.usage.rebuild(['root'], async () => ({
        events: [sample],
        inheritedEventCount: 0,
      })),
    ).toMatchObject({ folded: 0, failed: 0 });
    expect(current.usage.rolling('24h')).toMatchObject({ totalTokens: 7, status: 'partial' });
    expect(current.usage.activity('ada', '2000-01-01T00:00:00Z')).toEqual(before);
    current.database.close();
    expect(open(home).usage.rolling('24h')).toMatchObject({ totalTokens: 7, status: 'partial' });
  },
);

it('bounds indexed receipt work without materializing Session logs and marks the reported sum as a lower bound', () => {
  const { usage, port } = open();
  port.transaction(
    (connection) => {
      const insert = connection.prepare(
        'INSERT INTO usage_receipts(fingerprint,bot_slug,occurred_at_ms,total_tokens) VALUES (?,?,?,?)',
      );
      for (let index = 0; index < 50_002; index++)
        insert.run('sample-' + index, 'ada', Date.parse('2026-10-18T11:00:00Z'), 1);
    },
    ['usage'],
  );
  expect(usage.rolling('24h')).toMatchObject({
    totalTokens: 50_001,
    records: 50_001,
    recordLimit: 50_000,
    truncated: true,
    status: 'partial',
  });
});

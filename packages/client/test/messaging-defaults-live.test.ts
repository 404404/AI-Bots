import { expect, it, vi } from 'vitest';
import { subscribeMessagingDefaults } from '../src/client/messaging-defaults-live.js';
import { mountActivityLive } from '../src/client/activity-live.js';
import { createStore } from '../src/client/store.js';

it('keeps roster and independent activity consumers on one connection and replays the live baseline', async () => {
  const streams: Events[] = [];
  class Events extends EventTarget {
    readyState = 1;
    closed = false;
    constructor(readonly url: string) {
      super();
      streams.push(this);
    }
    close() {
      this.closed = true;
      this.readyState = 2;
    }
  }
  vi.stubGlobal('EventSource', Events);
  const roster = vi.fn();
  const stopRoster = subscribeMessagingDefaults(roster);
  const store = createStore();
  store.setMode('bot');
  store.setRoster(
    [
      {
        slug: 'ada',
        displayName: 'Ada',
        roles: [],
        workspaces: [],
        description: '',
        paused: false,
        aggregateState: 'idle',
        createdAt: '2026-10-01T00:00:00Z',
      },
    ],
    [],
  );
  let stopActivity = () => {};
  let stopLateActivity = () => {};
  try {
    stopActivity = mountActivityLive(store);
    expect(streams).toHaveLength(1);
    expect(streams[0]!.url).toContain('scope=roster');
    expect(streams[0]!.url).toContain('activity=1');
    streams[0]!.dispatchEvent(
      new MessageEvent('activity/snapshot', {
        data: JSON.stringify({
          generation: 'host',
          revision: 1,
          bots: [{ slug: 'ada', state: 'working' }],
        }),
      }),
    );
    expect(store.getSnapshot().bots[0]?.aggregateState).toBe('working');
    stopActivity();
    expect(streams[0]!.closed).toBe(false);
    const late = createStore();
    late.setMode('bot');
    late.setRoster(
      store.getSnapshot().bots.map((bot) => ({ ...bot, aggregateState: 'idle' })),
      [],
    );
    stopLateActivity = mountActivityLive(late);
    await new Promise<void>((resolve) => queueMicrotask(resolve));
    expect(streams).toHaveLength(1);
    expect(late.getSnapshot().bots[0]?.aggregateState).toBe('working');
    streams[0]!.dispatchEvent(new Event('roster/changed'));
    expect(roster).toHaveBeenCalledOnce();
    stopRoster();
    expect(streams[0]!.closed).toBe(false);
    stopLateActivity();
    expect(streams[0]!.closed).toBe(true);
    streams[0]!.dispatchEvent(
      new MessageEvent('activity/snapshot', {
        data: JSON.stringify({
          generation: 'host',
          revision: 2,
          bots: [{ slug: 'ada', state: 'thinking' }],
        }),
      }),
    );
    expect(late.getSnapshot().bots[0]?.aggregateState).toBe('working');
  } finally {
    stopActivity();
    stopLateActivity();
    stopRoster();
    vi.unstubAllGlobals();
  }
});
it('shares one roster transport and releases it only when the last mounted consumer leaves', () => {
  const streams: Events[] = [];
  class Events extends EventTarget {
    closed = false;
    constructor() {
      super();
      streams.push(this);
    }
    close() {
      this.closed = true;
    }
  }
  vi.stubGlobal('EventSource', Events);
  const first = vi.fn(),
    second = vi.fn();
  const stopFirst = subscribeMessagingDefaults(first),
    stopSecond = subscribeMessagingDefaults(second);
  try {
    expect(streams).toHaveLength(1);
    streams[0]!.dispatchEvent(new Event('roster/changed'));
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
    stopFirst();
    expect(streams[0]!.closed).toBe(false);
    streams[0]!.dispatchEvent(new Event('open'));
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(2);
  } finally {
    stopSecond();
    vi.unstubAllGlobals();
  }
  expect(streams[0]!.closed).toBe(true);
});

it('keeps a late activity consumer stale with HTTP recovery while the shared transport reconnects', async () => {
  vi.useFakeTimers();
  const streams: Events[] = [];
  class Events extends EventTarget {
    readyState = 1;
    constructor() {
      super();
      streams.push(this);
    }
    close() {
      this.readyState = 2;
    }
  }
  vi.stubGlobal('EventSource', Events);
  const stopRoster = subscribeMessagingDefaults(() => {});
  const first = createStore();
  first.setMode('bot');
  const stopFirst = mountActivityLive(first);
  const recovery = vi.fn(async () => undefined);
  const late = createStore();
  late.setMode('bot');
  let stopLate = () => {};
  try {
    streams[0]!.dispatchEvent(
      new MessageEvent('activity/snapshot', {
        data: JSON.stringify({ generation: 'host', revision: 1, bots: [] }),
      }),
    );
    streams[0]!.readyState = 0;
    streams[0]!.dispatchEvent(new Event('error'));
    stopLate = mountActivityLive(late, undefined, recovery);
    await vi.runAllTicks();
    await Promise.resolve();
    expect(late.getSnapshot().activitySync).toBe('stale');
    await vi.advanceTimersByTimeAsync(10_000);
    expect(recovery).toHaveBeenCalledTimes(2);
    streams[0]!.readyState = 1;
    streams[0]!.dispatchEvent(
      new MessageEvent('activity/snapshot', {
        data: JSON.stringify({ generation: 'host', revision: 2, bots: [] }),
      }),
    );
    expect(late.getSnapshot().activitySync).toBe('live');
  } finally {
    stopFirst();
    stopLate();
    stopRoster();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  }
});

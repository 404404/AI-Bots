import { expect, it, vi } from 'vitest';
import { createTypedLive, SNAPSHOT_REMOTE_DESCRIPTORS } from '../src/client/live-snapshots.js';
import {
  installTypedLive,
  openRosterActivity,
  openSharedChannel,
  subscribeMessagingDefaults,
  type TypedLive,
} from '../src/client/messaging-defaults-live.js';

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

function channel<Frame>() {
  const queue: IteratorResult<Frame>[] = [];
  let wake: (() => void) | undefined;
  const put = (result: IteratorResult<Frame>): void => {
    queue.push(result);
    wake?.();
  };
  return {
    push: (value: Frame) => put({ done: false, value }),
    async *items(signal: AbortSignal): AsyncGenerator<Frame> {
      signal.addEventListener('abort', () => put({ done: true, value: undefined }), { once: true });
      for (;;) {
        while (queue.length === 0)
          await new Promise<void>((resolve) => {
            wake = resolve;
          });
        const next = queue.shift()!;
        if (next.done) return;
        yield next.value;
      }
    },
  };
}

it('declares parameterless stream methods for roster and Activity', () => {
  expect(SNAPSHOT_REMOTE_DESCRIPTORS.map((descriptor) => descriptor.method)).toEqual([
    'followRoster',
    'followActivity',
  ]);
  for (const descriptor of SNAPSHOT_REMOTE_DESCRIPTORS)
    expect(descriptor).toMatchObject({
      namespace: 'botharness',
      mode: 'stream',
      parameters: [],
      cancellation: { parameter: 'signal' },
    });
});

it('consumes a baseline then increments through the Gateway snapshot stream', async () => {
  const roster = channel<unknown>();
  const signals: AbortSignal[] = [];
  const remote = {
    $stream: (options: { open: (signal: AbortSignal) => AsyncIterable<unknown> }) => {
      const lifetime = new AbortController();
      signals.push(lifetime.signal);
      return {
        restart: () => undefined,
        dispose: async () => lifetime.abort(),
        async *[Symbol.asyncIterator]() {
          for await (const value of options.open(lifetime.signal))
            yield { generation: 1, value, signal: lifetime.signal, accept: () => undefined };
        },
      };
    },
  };
  const live = createTypedLive(remote as never, () => ({
    followRoster: (signal) => roster.items(signal) as never,
    followActivity: () => {
      throw new Error('unused');
    },
  }));
  const handlers = {
    baseline: vi.fn(),
    changed: vi.fn(),
    purged: vi.fn(),
    interrupted: vi.fn(),
  };
  const stop = live.roster(handlers);
  const placements = [{ sourceEventId: 'source', channelId: 'channel', messageId: 'message' }];
  roster.push({ type: 'baseline', placements });
  roster.push({ type: 'changed' });
  roster.push({ type: 'purged', placements });
  await settle();
  expect(handlers.baseline).toHaveBeenCalledWith(placements);
  expect(handlers.changed).toHaveBeenCalledTimes(1);
  expect(handlers.purged).toHaveBeenCalledWith(placements);
  stop();
  await settle();
  expect(signals[0]!.aborted).toBe(true);
});

it('gives roster and Activity their own typed streams and leaves only the Channel on the shared source', async () => {
  const sources: Events[] = [];
  class Events extends EventTarget {
    readyState = 1;
    closed = false;
    constructor(readonly url: string) {
      super();
      sources.push(this);
    }
    close() {
      this.closed = true;
    }
  }
  vi.stubGlobal('EventSource', Events);
  let roster: Parameters<TypedLive['roster']>[0] | undefined;
  let activity: Parameters<TypedLive['activity']>[0] | undefined;
  const stopRoster = vi.fn();
  const stopActivity = vi.fn();
  const uninstall = installTypedLive({
    roster: (handlers) => {
      roster = handlers;
      return stopRoster;
    },
    activity: (handlers) => {
      activity = handlers;
      return stopActivity;
    },
  });
  const listener = vi.fn();
  const purged = vi.fn();
  const unsubscribe = subscribeMessagingDefaults(listener, purged);
  const feed = openRosterActivity()!;
  const snapshots: string[] = [];
  feed.addEventListener('activity/snapshot', (event) =>
    snapshots.push((event as MessageEvent).data),
  );
  try {
    expect(sources).toHaveLength(0);
    expect(feed.readyState).toBe(0);
    const placements = [{ sourceEventId: 'source', channelId: 'channel', messageId: 'message' }];
    roster!.baseline(placements);
    roster!.changed();
    expect(listener).toHaveBeenCalledTimes(2);
    expect(purged).toHaveBeenCalledWith(placements);
    activity!.snapshot('{"revision":1}');
    expect(snapshots).toEqual(['{"revision":1}']);
    expect(feed.readyState).toBe(1);
    activity!.interrupted();
    expect(feed.readyState).toBe(0);

    const live = openSharedChannel('/api/botharness/stream?channelId=c1&after=2');
    expect(sources).toHaveLength(1);
    expect(sources[0]!.url).toBe('/api/botharness/stream?channelId=c1&after=2');
    live.close();
    expect(sources[0]!.closed).toBe(true);

    feed.close();
    expect(stopActivity).toHaveBeenCalledTimes(1);
    unsubscribe();
    expect(stopRoster).toHaveBeenCalledTimes(1);
  } finally {
    feed.close();
    unsubscribe();
    uninstall();
    vi.unstubAllGlobals();
  }
});

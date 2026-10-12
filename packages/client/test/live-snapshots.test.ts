import { expect, it, vi } from 'vitest';
import {
  CHANNEL_REMOTE_DESCRIPTOR,
  COMPANION_REMOTE_DESCRIPTOR,
  createChannelFollow,
  createCompanionSource,
  createTypedLive,
  SNAPSHOT_REMOTE_DESCRIPTORS,
} from '../src/client/live-snapshots.js';
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

it('declares the Channel stream with strict Channel ID and revision parameters', () => {
  expect(CHANNEL_REMOTE_DESCRIPTOR).toMatchObject({ method: 'followChannel', mode: 'stream' });
  const [channelId, after] = CHANNEL_REMOTE_DESCRIPTOR.parameters.map((parameter) =>
    parameter.codec.create(),
  );
  expect(channelId!.parse('c1')).toBe('c1');
  expect(() => channelId!.parse(1)).toThrow('Expected a Channel ID');
  expect(after!.parse(3)).toBe(3);
  expect(() => after!.parse(-1)).toThrow('Expected a revision');
});

it('follows a Channel from the last delivered revision and reports a terminal failure as closed', async () => {
  const generations: ReturnType<typeof channel<unknown>>[] = [];
  const opens: number[] = [];
  let reopen: (() => void) | undefined;
  let carrierFailed: (() => void) | undefined;
  let fail: ((error: Error) => void) | undefined;
  const remote = {
    $stream: (options: {
      open: (signal: AbortSignal) => AsyncIterable<unknown>;
      carrierFailed?: () => void;
    }) => {
      const lifetime = new AbortController();
      carrierFailed = options.carrierFailed;
      return {
        dispose: async () => lifetime.abort(),
        async *[Symbol.asyncIterator]() {
          for (;;) {
            const generation = new AbortController();
            lifetime.signal.addEventListener('abort', () => generation.abort(), { once: true });
            const failed = new Promise<never>((_resolve, reject) => {
              fail = reject;
            });
            failed.catch(() => undefined);
            reopen = () => generation.abort();
            const items = options.open(generation.signal)[Symbol.asyncIterator]();
            for (;;) {
              const next = await Promise.race([items.next(), failed]);
              if (next.done) break;
              yield {
                generation: 1,
                value: next.value,
                signal: generation.signal,
                accept: () => undefined,
              };
            }
            if (lifetime.signal.aborted) return;
          }
        },
      };
    },
  };
  const follow = createChannelFollow(remote as never, () => ({
    followChannel: (_channelId, after, signal) => {
      opens.push(after);
      const generation = channel<unknown>();
      generations.push(generation);
      return generation.items(signal) as never;
    },
  }));
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  const frames: unknown[] = [];
  const interrupted = vi.fn();
  const stop = follow('c1', 3, { frame: (value) => frames.push(value), interrupted });
  try {
    await settle();
    expect(opens).toEqual([3]);
    generations[0]!.push({ type: 'opened', cursor: 3 });
    generations[0]!.push({ type: 'entry', entry: { channelId: 'c1', revision: 4, message: {} } });
    await settle();
    expect(frames).toHaveLength(2);
    carrierFailed!();
    expect(interrupted).toHaveBeenLastCalledWith(false);
    reopen!();
    await settle();
    expect(opens).toEqual([3, 4]);
    fail!(new Error('Unknown Channel'));
    await settle();
    expect(interrupted).toHaveBeenLastCalledWith(true);
  } finally {
    stop();
    warn.mockRestore();
  }
});

it('presents the typed Companion stream as the source the Companion owner consumes', async () => {
  expect(COMPANION_REMOTE_DESCRIPTOR.parameters.map((parameter) => parameter.wire)).toEqual([
    'resume',
    'lastEventId',
  ]);
  const feed = channel<unknown>();
  const opens: [string, string][] = [];
  let carrierFailed: (() => void) | undefined;
  const remote = {
    $stream: (options: {
      open: (signal: AbortSignal) => AsyncIterable<unknown>;
      carrierFailed?: () => void;
    }) => {
      const lifetime = new AbortController();
      carrierFailed = options.carrierFailed;
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
  const source = createCompanionSource(remote as never, () => ({
    followCompanion: (resume, lastEventId, signal) => {
      opens.push([resume, lastEventId]);
      return feed.items(signal) as never;
    },
  }))('/api/botharness/companion?subscribe=1&resume=r1');
  const seen: unknown[] = [];
  source.addEventListener('companion/baseline', (event) =>
    seen.push(['baseline', (event as MessageEvent).data]),
  );
  source.addEventListener('companion/message', (event) =>
    seen.push(['message', (event as MessageEvent).data]),
  );
  source.addEventListener('error', () => seen.push(['error', source.readyState]));
  await settle();
  expect(source.readyState).toBe(0);
  expect(opens).toEqual([['r1', '']]);
  feed.push({ type: 'baseline', value: { consumerId: 'c1' }, id: 'c1' });
  feed.push({ type: 'message', value: { botId: 'ada' }, id: 'c1' });
  await settle();
  expect(source.readyState).toBe(1);
  expect(seen).toEqual([
    ['baseline', { consumerId: 'c1' }],
    ['message', { botId: 'ada' }],
  ]);
  carrierFailed!();
  expect(seen.at(-1)).toEqual(['error', 0]);
  source.close();
  expect(source.readyState).toBe(2);
});

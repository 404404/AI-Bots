import { expect, it, vi } from 'vitest';
import {
  installRosterTransport,
  subscribeMessagingDefaults,
} from '../src/client/messaging-defaults-live.js';
import {
  createRosterRemoteTransport,
  ROSTER_REMOTE_CONTRIBUTION,
  type RosterRemote,
} from '../src/client/roster-remote.js';

function feed() {
  const queue: IteratorResult<unknown>[] = [];
  let wake: (() => void) | undefined;
  const put = (result: IteratorResult<unknown>): void => {
    queue.push(result);
    wake?.();
  };
  return {
    push: (value: unknown) => put({ done: false, value }),
    end: () => put({ done: true, value: undefined }),
    async *items(signal: AbortSignal): AsyncGenerator<unknown> {
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

function fakeRemote() {
  const generations: ReturnType<typeof feed>[] = [];
  const signals: AbortSignal[] = [];
  const accepted: unknown[] = [];
  const remote: RosterRemote = {
    watchRoster: (signal) => {
      const generation = feed();
      generations.push(generation);
      signals.push(signal);
      return generation.items(signal);
    },
    $stream: (options) => {
      const lifetime = new AbortController();
      return {
        dispose: async () => lifetime.abort(),
        async *[Symbol.asyncIterator]() {
          for await (const value of options.open(lifetime.signal))
            yield { value, accept: () => accepted.push(value) };
          if (!lifetime.signal.aborted) throw options.ended(true);
        },
      };
    },
  };
  return { remote, generations, signals, accepted };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

it('declares the stream method the Host exports through its source marker', () => {
  expect(ROSTER_REMOTE_CONTRIBUTION.descriptors).toEqual([
    {
      id: 'src:botharnessBridge#botharness/watchRoster',
      service: 'botharnessBridge',
      namespace: 'botharness',
      method: 'watchRoster',
      mode: 'stream',
      invocation: { kind: 'direct' },
      parameters: [],
      cancellation: { parameter: 'signal' },
      result: { mode: 'src-json' },
    },
  ]);
});

it('delivers roster facts, reopens after a terminal end and stops with its consumer', async () => {
  const { remote, generations, signals, accepted } = fakeRemote();
  const waits: number[] = [];
  const handlers = { ready: vi.fn(), changed: vi.fn(), purged: vi.fn() };
  const stop = createRosterRemoteTransport(remote, async (ms) => {
    waits.push(ms);
  })(handlers);
  await settle();
  expect(generations).toHaveLength(1);
  const placements = [{ sourceEventId: 'source', channelId: 'channel', messageId: 'message' }];
  generations[0]!.push({ type: 'ready' });
  generations[0]!.push({ type: 'roster/changed' });
  generations[0]!.push({ type: 'content/purged', placements });
  await settle();
  expect(handlers.ready).toHaveBeenCalledTimes(1);
  expect(handlers.changed).toHaveBeenCalledTimes(1);
  expect(handlers.purged).toHaveBeenCalledWith(placements);
  expect(accepted).toHaveLength(3);

  generations[0]!.end();
  await settle();
  expect(waits).toEqual([500]);
  expect(generations).toHaveLength(2);
  generations[1]!.push({ type: 'unknown' });
  await settle();
  expect(waits).toEqual([500, 1000]);
  expect(generations).toHaveLength(3);
  generations[2]!.push({ type: 'ready' });
  await settle();
  expect(handlers.ready).toHaveBeenCalledTimes(2);

  stop();
  await settle();
  expect(signals[2]!.aborted).toBe(true);
  expect(generations).toHaveLength(3);
});

it('moves the shared roster stream onto an installed transport and back to SSE', () => {
  const sources: Events[] = [];
  class Events extends EventTarget {
    closed = false;
    constructor() {
      super();
      sources.push(this);
    }
    close() {
      this.closed = true;
    }
  }
  vi.stubGlobal('EventSource', Events);
  const stopNative = vi.fn();
  let native: { ready(): void; changed(): void } | undefined;
  const listener = vi.fn();
  const unsubscribe = subscribeMessagingDefaults(listener);
  try {
    expect(sources).toHaveLength(1);
    const uninstall = installRosterTransport((handlers) => {
      native = handlers;
      return stopNative;
    });
    expect(sources[0]!.closed).toBe(true);
    native!.ready();
    native!.changed();
    expect(listener).toHaveBeenCalledTimes(2);
    uninstall();
    expect(stopNative).toHaveBeenCalledTimes(1);
    expect(sources).toHaveLength(2);
    expect(sources[1]!.closed).toBe(false);
  } finally {
    unsubscribe();
    vi.unstubAllGlobals();
  }
  expect(sources[1]!.closed).toBe(true);
});

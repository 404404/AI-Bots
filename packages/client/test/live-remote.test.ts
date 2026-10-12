import { expect, it, vi } from 'vitest';
import {
  installLiveSource,
  subscribeMessagingDefaults,
} from '../src/client/messaging-defaults-live.js';
import {
  createRemoteLiveSource,
  LIVE_REMOTE_CONTRIBUTION,
  type LiveRemote,
} from '../src/client/live-remote.js';

function feed() {
  const queue: (IteratorResult<unknown> | { error: unknown })[] = [];
  let wake: (() => void) | undefined;
  const put = (result: IteratorResult<unknown> | { error: unknown }): void => {
    queue.push(result);
    wake?.();
  };
  return {
    push: (value: unknown) => put({ done: false, value }),
    end: () => put({ done: true, value: undefined }),
    fail: (error: unknown) => put({ error }),
    async *items(signal: AbortSignal): AsyncGenerator<unknown> {
      signal.addEventListener('abort', () => put({ done: true, value: undefined }), { once: true });
      for (;;) {
        while (queue.length === 0)
          await new Promise<void>((resolve) => {
            wake = resolve;
          });
        const next = queue.shift()!;
        if ('error' in next) throw next.error;
        if (next.done) return;
        yield next.value;
      }
    },
  };
}

function fakeRemote() {
  const generations: ReturnType<typeof feed>[] = [];
  const opens: { query: string; resume: string; signal: AbortSignal }[] = [];
  let carrierFailed: ((error: Error) => void) | undefined;
  const remote: LiveRemote = {
    liveFrames: (query, resume, signal) => {
      const generation = feed();
      generations.push(generation);
      opens.push({ query, resume, signal });
      return generation.items(signal);
    },
    $stream: (options) => {
      const lifetime = new AbortController();
      carrierFailed = options.carrierFailed;
      return {
        dispose: async () => lifetime.abort(),
        async *[Symbol.asyncIterator]() {
          for await (const value of options.open(lifetime.signal))
            yield { value, accept: () => undefined };
          if (!lifetime.signal.aborted) throw options.ended(true);
        },
      };
    },
  };
  return { remote, generations, opens, carrier: () => carrierFailed?.(new Error('carrier')) };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

it('declares the stream method with strict string parameters', () => {
  const [descriptor] = LIVE_REMOTE_CONTRIBUTION.descriptors;
  expect(descriptor).toMatchObject({
    namespace: 'botharness',
    method: 'liveFrames',
    mode: 'stream',
    invocation: { kind: 'direct' },
    cancellation: { parameter: 'signal' },
  });
  expect(descriptor!.parameters.map((parameter) => parameter.wire)).toEqual(['query', 'resume']);
  const schema = descriptor!.parameters[0]!.codec.create();
  expect(schema.parse('scope=roster')).toBe('scope=roster');
  expect(() => schema.parse(1)).toThrow('Expected a string');
});

it('behaves like an EventSource: open, typed messages, resume after an end, closed on refusal', async () => {
  const { remote, generations, opens, carrier } = fakeRemote();
  const waits: number[] = [];
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  const source = createRemoteLiveSource(remote, async (ms) => {
    waits.push(ms);
  })('/api/botharness/stream?channelId=c1&after=3');
  const seen: string[] = [];
  source.addEventListener('open', () => seen.push('open'));
  source.addEventListener('error', () => seen.push(`error:${source.readyState}`));
  source.addEventListener('channel/message', (event) =>
    seen.push(`message:${(event as MessageEvent).data}:${(event as MessageEvent).lastEventId}`),
  );
  try {
    await settle();
    expect(source.readyState).toBe(0);
    expect(opens[0]).toMatchObject({ query: 'channelId=c1&after=3', resume: '' });
    generations[0]!.push({ event: 'open', data: '' });
    generations[0]!.push({ event: 'channel/message', data: '{"n":4}', id: '4' });
    await settle();
    expect(source.readyState).toBe(1);
    expect(seen).toEqual(['open', 'message:{"n":4}:4']);

    carrier();
    expect(seen.at(-1)).toBe('error:0');

    generations[0]!.end();
    await settle();
    expect(waits).toEqual([500]);
    expect(opens[1]).toMatchObject({ query: 'channelId=c1&after=3', resume: '4' });
    generations[1]!.push({ event: 'open', data: '' });
    await settle();
    expect(source.readyState).toBe(1);

    generations[1]!.fail(Object.assign(new Error('Unknown Channel'), { code: 'not-found' }));
    await settle();
    expect(source.readyState).toBe(2);
    expect(seen.at(-1)).toBe('error:2');
    expect(opens).toHaveLength(2);
  } finally {
    source.close();
    warn.mockRestore();
  }
});

it('stops its generation when closed', async () => {
  const { remote, generations, opens } = fakeRemote();
  const source = createRemoteLiveSource(remote, async () => undefined)('/x?scope=roster');
  await settle();
  generations[0]!.push({ event: 'open', data: '' });
  await settle();
  source.close();
  await settle();
  expect(source.readyState).toBe(2);
  expect(opens[0]!.signal.aborted).toBe(true);
  expect(opens).toHaveLength(1);
});

it('moves the shared document stream onto an installed source and back to SSE', () => {
  const sse: Events[] = [];
  class Events extends EventTarget {
    readyState = 1;
    closed = false;
    constructor(readonly url: string) {
      super();
      sse.push(this);
    }
    close() {
      this.closed = true;
    }
  }
  vi.stubGlobal('EventSource', Events);
  const native: Events[] = [];
  const listener = vi.fn();
  const unsubscribe = subscribeMessagingDefaults(listener);
  try {
    expect(sse).toHaveLength(1);
    const uninstall = installLiveSource((url) => {
      const source = new Events(url);
      sse.pop();
      native.push(source);
      return source;
    });
    expect(sse[0]!.closed).toBe(true);
    expect(native[0]!.url).toBe(sse[0]!.url);
    native[0]!.dispatchEvent(new Event('open'));
    native[0]!.dispatchEvent(new Event('roster/changed'));
    expect(listener).toHaveBeenCalledTimes(2);
    sse[0]!.dispatchEvent(new Event('roster/changed'));
    expect(listener).toHaveBeenCalledTimes(2);
    uninstall();
    expect(native[0]!.closed).toBe(true);
    expect(sse).toHaveLength(2);
  } finally {
    unsubscribe();
    vi.unstubAllGlobals();
  }
  expect(sse[1]!.closed).toBe(true);
});

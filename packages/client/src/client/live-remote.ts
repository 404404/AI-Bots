import type { LiveFrame } from '../../../core/src/channels/live-frames.js';
import type { LiveSource } from './messaging-defaults-live.js';

const text = Object.freeze({
  mode: 'strict' as const,
  typeSymbol: '@botharness/core#botharness/liveFrames:string',
  create: () => ({
    parse: (value: unknown): string => {
      if (typeof value !== 'string') throw new TypeError('Expected a string');
      return value;
    },
  }),
});

export const LIVE_REMOTE_CONTRIBUTION = Object.freeze({
  package: '@botharness/core',
  descriptors: Object.freeze([
    Object.freeze({
      id: 'src:botharnessBridge#botharness/liveFrames',
      service: 'botharnessBridge',
      namespace: 'botharness',
      method: 'liveFrames',
      mode: 'stream' as const,
      invocation: Object.freeze({ kind: 'direct' as const }),
      parameters: Object.freeze([
        Object.freeze({ name: 'query', wire: 'query', source: 'json' as const, codec: text }),
        Object.freeze({ name: 'resume', wire: 'resume', source: 'json' as const, codec: text }),
      ]),
      cancellation: Object.freeze({ parameter: 'signal' as const }),
      result: Object.freeze({ mode: 'src-json' as const }),
    }),
  ]),
});

interface LiveStreamItem {
  readonly value: unknown;
  accept(): void;
}

export interface LiveRemote {
  $stream(options: {
    name: string;
    open: (signal: AbortSignal) => AsyncIterable<unknown>;
    ended: (accepted: boolean) => Error;
    carrierFailed?: (error: Error) => void;
  }): AsyncIterable<LiveStreamItem> & { dispose(): Promise<void> };
  liveFrames(query: string, resume: string, signal: AbortSignal): AsyncIterable<unknown>;
}

const FIRST_RETRY_MS = 500;
const LAST_RETRY_MS = 10_000;
const REFUSED = new Set(['not-found', 'conflict', 'invalid']);
const ENDED = 'botharness live stream ended';

function isFrame(value: unknown): value is LiveFrame {
  return (
    typeof value === 'object' &&
    value !== null &&
    'event' in value &&
    typeof value.event === 'string' &&
    'data' in value &&
    typeof value.data === 'string' &&
    (!('id' in value) || typeof value.id === 'string')
  );
}

function refused(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string' &&
    REFUSED.has(error.code)
  );
}

function pause(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const done = (): void => {
      clearTimeout(timer);
      signal.removeEventListener('abort', done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    signal.addEventListener('abort', done, { once: true });
  });
}

class RemoteLiveSource extends EventTarget implements LiveSource {
  readyState = 0;
  private readonly lifetime = new AbortController();
  private resume = '';

  constructor(
    private readonly query: string,
    private readonly remote: LiveRemote,
    private readonly wait: (ms: number, signal: AbortSignal) => Promise<void>,
  ) {
    super();
    void this.run();
  }

  close(): void {
    this.readyState = 2;
    this.lifetime.abort();
  }

  private interrupted(): void {
    if (this.lifetime.signal.aborted) return;
    this.readyState = 0;
    this.dispatchEvent(new Event('error'));
  }

  private async run(): Promise<void> {
    let delay = FIRST_RETRY_MS;
    while (!this.lifetime.signal.aborted) {
      const stream = this.remote.$stream({
        name: 'botharness live',
        open: (signal) => this.remote.liveFrames(this.query, this.resume, signal),
        ended: () => new Error(ENDED),
        carrierFailed: () => this.interrupted(),
      });
      const stop = (): void => void stream.dispose();
      this.lifetime.signal.addEventListener('abort', stop, { once: true });
      let closed = false;
      try {
        for await (const item of stream) {
          if (!isFrame(item.value)) throw new Error('Invalid botharness live frame');
          item.accept();
          delay = FIRST_RETRY_MS;
          if (this.lifetime.signal.aborted) return;
          if (item.value.event === 'open') {
            this.readyState = 1;
            this.dispatchEvent(new Event('open'));
            continue;
          }
          if (item.value.id !== undefined) this.resume = item.value.id;
          this.dispatchEvent(
            new MessageEvent(item.value.event, {
              data: item.value.data,
              lastEventId: this.resume,
            }),
          );
        }
      } catch (error) {
        closed = refused(error);
        if (!closed && !this.lifetime.signal.aborted && delay === FIRST_RETRY_MS)
          console.warn('botharness: live stream interrupted', error);
      } finally {
        this.lifetime.signal.removeEventListener('abort', stop);
        await stream.dispose().catch(() => {});
      }
      if (this.lifetime.signal.aborted) return;
      if (closed) {
        this.readyState = 2;
        this.dispatchEvent(new Event('error'));
        return;
      }
      this.interrupted();
      await this.wait(delay, this.lifetime.signal);
      delay = Math.min(delay * 2, LAST_RETRY_MS);
    }
  }
}

export function createRemoteLiveSource(
  remote: LiveRemote,
  wait: (ms: number, signal: AbortSignal) => Promise<void> = pause,
): (url: string) => LiveSource {
  return (url) => {
    const query = url.includes('?') ? url.slice(url.indexOf('?') + 1) : '';
    return new RemoteLiveSource(query, remote, wait);
  };
}

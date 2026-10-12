import type { RosterLiveItem } from '../../../core/src/channels/live.js';
import type { RosterTransport } from './messaging-defaults-live.js';

export const ROSTER_REMOTE_CONTRIBUTION = Object.freeze({
  package: '@botharness/core',
  descriptors: Object.freeze([
    Object.freeze({
      id: 'src:botharnessBridge#botharness/watchRoster',
      service: 'botharnessBridge',
      namespace: 'botharness',
      method: 'watchRoster',
      mode: 'stream' as const,
      invocation: Object.freeze({ kind: 'direct' as const }),
      parameters: Object.freeze([]),
      cancellation: Object.freeze({ parameter: 'signal' as const }),
      result: Object.freeze({ mode: 'src-json' as const }),
    }),
  ]),
});

interface RosterStreamItem {
  readonly value: unknown;
  accept(): void;
}

export interface RosterRemote {
  $stream(options: {
    name: string;
    open: (signal: AbortSignal) => AsyncIterable<unknown>;
    ended: (accepted: boolean) => Error;
  }): AsyncIterable<RosterStreamItem> & { dispose(): Promise<void> };
  watchRoster(signal: AbortSignal): AsyncIterable<unknown>;
}

const FIRST_RETRY_MS = 500;
const LAST_RETRY_MS = 10_000;

function isRosterItem(value: unknown): value is RosterLiveItem {
  if (typeof value !== 'object' || value === null || !('type' in value)) return false;
  if (value.type === 'ready' || value.type === 'roster/changed') return true;
  return (
    value.type === 'content/purged' && 'placements' in value && Array.isArray(value.placements)
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

export function createRosterRemoteTransport(
  remote: RosterRemote,
  wait: (ms: number, signal: AbortSignal) => Promise<void> = pause,
): RosterTransport {
  return (handlers) => {
    const lifetime = new AbortController();
    const run = async (): Promise<void> => {
      let delay = FIRST_RETRY_MS;
      while (!lifetime.signal.aborted) {
        const stream = remote.$stream({
          name: 'botharness roster live',
          open: (signal) => remote.watchRoster(signal),
          ended: () => new Error('botharness roster live ended'),
        });
        const stop = (): void => void stream.dispose();
        lifetime.signal.addEventListener('abort', stop, { once: true });
        try {
          for await (const item of stream) {
            if (!isRosterItem(item.value)) throw new Error('Invalid botharness roster live item');
            item.accept();
            delay = FIRST_RETRY_MS;
            if (item.value.type === 'ready') handlers.ready();
            else if (item.value.type === 'roster/changed') handlers.changed();
            else handlers.purged(item.value.placements);
          }
        } catch (error) {
          if (!lifetime.signal.aborted && delay === FIRST_RETRY_MS)
            console.warn('botharness: roster live stream interrupted', error);
        } finally {
          lifetime.signal.removeEventListener('abort', stop);
          await stream.dispose().catch(() => {});
        }
        if (lifetime.signal.aborted) return;
        await wait(delay, lifetime.signal);
        delay = Math.min(delay * 2, LAST_RETRY_MS);
      }
    };
    void run();
    return () => lifetime.abort();
  };
}

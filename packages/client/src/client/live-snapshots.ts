import {
  RemoteSnapshotStream,
  RemoteStreamCarrierError,
} from '@deepseek-ai/dsh-api-gateway/client';
import type { ClientRemote } from '@deepseek-ai/dsh-api-gateway/client';
import type {
  ActivityLiveFrame,
  ChannelLiveFrame,
  RosterLiveFrame,
} from '../../../core/src/channels/live.js';
import type { ChannelFollow } from './channel-live.js';
import type { TypedLive } from './messaging-defaults-live.js';

const follow = Object.freeze({
  service: 'botharnessBridge',
  namespace: 'botharness',
  mode: 'stream' as const,
  invocation: Object.freeze({ kind: 'direct' as const }),
  parameters: Object.freeze([]),
  cancellation: Object.freeze({ parameter: 'signal' as const }),
  result: Object.freeze({ mode: 'src-json' as const }),
});

export const SNAPSHOT_REMOTE_DESCRIPTORS = Object.freeze([
  Object.freeze({
    ...follow,
    id: 'src:botharnessBridge#botharness/followRoster',
    method: 'followRoster',
  }),
  Object.freeze({
    ...follow,
    id: 'src:botharnessBridge#botharness/followActivity',
    method: 'followActivity',
  }),
]);

const strict = <Value>(name: string, accepts: (value: unknown) => value is Value) =>
  Object.freeze({
    mode: 'strict' as const,
    typeSymbol: `@botharness/core#botharness/followChannel:${name}`,
    create: () => ({
      parse: (value: unknown): Value => {
        if (!accepts(value)) throw new TypeError(`Expected ${name}`);
        return value;
      },
    }),
  });

export const CHANNEL_REMOTE_DESCRIPTOR = Object.freeze({
  ...follow,
  id: 'src:botharnessBridge#botharness/followChannel',
  method: 'followChannel',
  parameters: Object.freeze([
    Object.freeze({
      name: 'channelId',
      wire: 'channelId',
      source: 'json' as const,
      codec: strict('a Channel ID', (value): value is string => typeof value === 'string'),
    }),
    Object.freeze({
      name: 'after',
      wire: 'after',
      source: 'json' as const,
      codec: strict(
        'a revision',
        (value): value is number => Number.isSafeInteger(value) && (value as number) >= 0,
      ),
    }),
  ]),
});

export interface ChannelNamespace {
  followChannel(
    channelId: string,
    after: number,
    signal: AbortSignal,
  ): AsyncIterable<ChannelLiveFrame>;
}

export function createChannelFollow(
  remote: Pick<ClientRemote, '$stream'>,
  namespace: () => ChannelNamespace,
): ChannelFollow {
  return (channelId, after, handlers) => {
    const name = 'botharness Channel stream';
    let stopped = false;
    let cursor = after;
    const stream = remote.$stream<ChannelLiveFrame>({
      name,
      open: (signal) => namespace().followChannel(channelId, cursor, signal),
      ended: (accepted) =>
        accepted
          ? new RemoteStreamCarrierError(`${name} ended without a terminal result`)
          : new Error(`${name} ended before it opened`),
      carrierFailed: () => {
        if (!stopped) handlers.interrupted(false);
      },
    });
    const consume = async (): Promise<void> => {
      try {
        for await (const item of stream) {
          if (stopped) return;
          const frame = item.value;
          if (frame.type === 'opened') item.accept();
          else if (frame.type === 'entry') cursor = Math.max(cursor, frame.entry.revision);
          handlers.frame(frame);
        }
      } catch (error) {
        if (stopped) return;
        console.warn(`botharness: ${name} failed`, error);
        handlers.interrupted(true);
      }
    };
    void consume();
    return () => {
      stopped = true;
      void stream.dispose();
    };
  };
}

export interface SnapshotNamespace {
  followRoster(signal: AbortSignal): AsyncIterable<RosterLiveFrame>;
  followActivity(signal: AbortSignal): AsyncIterable<ActivityLiveFrame>;
}

const RETRY_MS = 5_000;

function supervised<Frame extends { type: string }>(
  remote: Pick<ClientRemote, '$stream'>,
  name: string,
  open: (signal: AbortSignal) => AsyncIterable<Frame>,
  handlers: {
    replace(frame: Frame): void;
    update(frame: Frame): void;
    interrupted(): void;
  },
): () => void {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let current: RemoteSnapshotStream<Frame, Frame> | undefined;
  const start = (): void => {
    timer = undefined;
    if (stopped) return;
    const stream = new RemoteSnapshotStream<Frame, Frame>(
      remote.$stream<Frame>({
        name,
        open,
        ended: (accepted) =>
          accepted
            ? new RemoteStreamCarrierError(`${name} ended without a terminal result`)
            : new Error(`${name} ended before its baseline`),
        carrierFailed: () => handlers.interrupted(),
      }),
      {
        name,
        isSnapshot: (frame): frame is Frame => frame.type === 'baseline',
        replace: handlers.replace,
        update: handlers.update,
        failed: (error) => {
          if (stopped || current !== stream) return;
          console.warn(`botharness: ${name} failed`, error);
          handlers.interrupted();
          current = undefined;
          void stream.dispose();
          timer = setTimeout(start, RETRY_MS);
        },
      },
    );
    current = stream;
    stream.start();
  };
  start();
  return () => {
    stopped = true;
    if (timer !== undefined) clearTimeout(timer);
    void current?.dispose();
    current = undefined;
  };
}

export function createTypedLive(
  remote: Pick<ClientRemote, '$stream'>,
  namespace: () => SnapshotNamespace,
): TypedLive {
  return {
    roster: (handlers) =>
      supervised<RosterLiveFrame>(
        remote,
        'botharness roster stream',
        (signal) => namespace().followRoster(signal),
        {
          replace: (frame) => {
            if (frame.type === 'baseline') handlers.baseline(frame.placements);
          },
          update: (frame) => {
            if (frame.type === 'changed') handlers.changed();
            else if (frame.type === 'purged') handlers.purged(frame.placements);
          },
          interrupted: handlers.interrupted,
        },
      ),
    activity: (handlers) =>
      supervised<ActivityLiveFrame>(
        remote,
        'botharness Activity stream',
        (signal) => namespace().followActivity(signal),
        {
          replace: (frame) => handlers.snapshot(JSON.stringify(frame.snapshot)),
          update: (frame) => handlers.snapshot(JSON.stringify(frame.snapshot)),
          interrupted: handlers.interrupted,
        },
      ),
  };
}

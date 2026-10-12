import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { LiveRefused, openLiveFrames, parseLiveFrame } from '../src/channels/live-frames.js';
import { createChannelLiveHub, type ChannelLiveHub } from '../src/channels/live.js';
import { createChannelStore } from '../src/channels/store.js';
import { followCompanion } from '../src/companions/live.js';

const roots: string[] = [];
const hubs: ChannelLiveHub[] = [];
function root(): string {
  const directory = mkdtempSync(join(tmpdir(), 'bh-live-frames-'));
  roots.push(directory);
  return directory;
}
afterEach(() => {
  for (const hub of hubs.splice(0)) hub.close();
  for (const directory of roots.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe('live frames on the native stream carrier', () => {
  it('parses event, id and multi-line data and drops comments and retry hints', () => {
    expect(parseLiveFrame('id: 7\nevent: channel/message\ndata: {"a":1}')).toEqual({
      event: 'channel/message',
      data: '{"a":1}',
      id: '7',
    });
    expect(parseLiveFrame('data: one\ndata: two')).toEqual({ event: 'message', data: 'one\ntwo' });
    expect(parseLiveFrame(': heartbeat')).toBeUndefined();
    expect(parseLiveFrame('retry: 1500')).toBeUndefined();
  });

  it('opens the existing hub, yields its roster facts and releases the subscriber on abort', async () => {
    const placements = [{ sourceEventId: 'source', channelId: 'channel', messageId: 'message' }];
    const hub = createChannelLiveHub(
      createChannelStore({ rootDir: root() }),
      undefined,
      () => placements,
    );
    hubs.push(hub);
    const abort = new AbortController();
    const frames = openLiveFrames((request) => hub.open(request), 'scope=roster', '', abort.signal);
    expect((await frames.next()).value).toEqual({ event: 'open', data: '' });
    const purged = (await frames.next()).value;
    expect(purged.event).toBe('content/purged');
    expect(JSON.parse(purged.data)).toEqual({ placements });
    hub.publishRosterCommitted();
    expect((await frames.next()).value).toEqual({ event: 'roster/changed', data: '{}' });
    const pending = frames.next();
    abort.abort();
    expect((await pending).done).toBe(true);
    hub.publishRosterCommitted();
  });

  it('ends when the hub closes and refuses what the HTTP route refuses', async () => {
    const hub = createChannelLiveHub(createChannelStore({ rootDir: root() }));
    hubs.push(hub);
    const open = (request: Request): Response => hub.open(request);
    const frames = openLiveFrames(open, 'scope=roster', '', new AbortController().signal);
    await frames.next();
    const closing = frames.next();
    hub.close();
    expect((await closing).done).toBe(true);

    const missing = openLiveFrames(open, 'channelId=missing', '', new AbortController().signal);
    await expect(missing.next()).rejects.toMatchObject({ name: 'LiveRefused', code: 'not-found' });
    const oversized = openLiveFrames(open, 'a'.repeat(4096), '', new AbortController().signal);
    await expect(oversized.next()).rejects.toBeInstanceOf(LiveRefused);
    const aborted = new AbortController();
    aborted.abort();
    expect((await openLiveFrames(open, 'scope=roster', '', aborted.signal).next()).done).toBe(true);
  });

  it('follows the roster as a baseline and typed increments and releases on abort', async () => {
    let placements = [{ sourceEventId: 'source', channelId: 'channel', messageId: 'message' }];
    const hub = createChannelLiveHub(
      createChannelStore({ rootDir: root() }),
      undefined,
      () => placements,
    );
    hubs.push(hub);
    const abort = new AbortController();
    const frames = hub.followRoster(abort.signal)[Symbol.asyncIterator]();
    expect((await frames.next()).value).toEqual({ type: 'baseline', placements });
    hub.publishRosterCommitted();
    hub.publishRosterCommitted();
    placements = [{ sourceEventId: 'new', channelId: 'shared', messageId: 'new-message' }];
    hub.publishContentPurged();
    expect((await frames.next()).value).toEqual({ type: 'changed' });
    expect((await frames.next()).value).toEqual({ type: 'purged', placements });
    const pending = frames.next();
    abort.abort();
    expect((await pending).done).toBe(true);
    hub.publishRosterCommitted();

    const closing = hub.followRoster(new AbortController().signal)[Symbol.asyncIterator]();
    await closing.next();
    const ended = closing.next();
    hub.close();
    expect((await ended).done).toBe(true);
  });

  it('follows Activity as a baseline and coalesced replacement snapshots', async () => {
    let revision = 0;
    const listeners = new Set<() => void>();
    const activity = {
      snapshot: () => ({ generation: 'g', revision, bots: {} }) as never,
      onChange: (listener: () => void) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    };
    const hub = createChannelLiveHub(createChannelStore({ rootDir: root() }), activity);
    hubs.push(hub);
    const abort = new AbortController();
    const frames = hub.followActivity(abort.signal)[Symbol.asyncIterator]();
    expect((await frames.next()).value).toMatchObject({
      type: 'baseline',
      snapshot: { revision: 0 },
    });
    for (revision = 1; revision < 4; revision++) for (const listener of listeners) listener();
    revision = 3;
    expect((await frames.next()).value).toMatchObject({
      type: 'changed',
      snapshot: { revision: 3 },
    });
    const pending = frames.next();
    abort.abort();
    expect((await pending).done).toBe(true);
    expect(listeners.size).toBe(0);

    const missing = createChannelLiveHub(createChannelStore({ rootDir: root() }));
    hubs.push(missing);
    await expect(
      missing.followActivity(new AbortController().signal)[Symbol.asyncIterator]().next(),
    ).rejects.toMatchObject({ name: 'LiveUnavailable' });
  });

  it('follows a Channel as opened, entries and typed notifications, and refuses like the HTTP route', async () => {
    let live: ChannelLiveHub | undefined;
    const store = createChannelStore({
      rootDir: root(),
      onCommitted: (commit) => live?.publishCommitted(commit),
    });
    const group = store.createGroup({ name: 'Team', members: [] });
    const text = (id: string) => ({
      id,
      at: '2026-09-21T00:00:00.000Z',
      author: { kind: 'human' as const },
      body: id,
    });
    await store.appendMessage(group.id, text('one'));
    const hub = createChannelLiveHub(store);
    live = hub;
    hubs.push(hub);
    const abort = new AbortController();
    const frames = hub.followChannel(group.id, 0, abort.signal)[Symbol.asyncIterator]();
    expect((await frames.next()).value).toEqual({ type: 'opened', cursor: 0 });
    expect((await frames.next()).value).toMatchObject({
      type: 'entry',
      entry: { channelId: group.id, revision: 1, message: { id: 'one' } },
    });
    let baseline = (await frames.next()).value;
    while (baseline.type !== 'notification' || baseline.notification.kind !== 'draft-baseline')
      baseline = (await frames.next()).value;
    expect(baseline.notification).toEqual({
      kind: 'draft-baseline',
      channelId: group.id,
      revision: 0,
      drafts: [],
    });
    await store.appendMessage(group.id, text('two'));
    expect((await frames.next()).value).toMatchObject({ type: 'entry', entry: { revision: 2 } });
    hub.publishDraft({
      type: 'update',
      draft: {
        channelId: group.id,
        draftId: 'attempt:call',
        attemptId: 'attempt',
        botSlug: 'ada',
        body: 'hi',
      },
    });
    expect((await frames.next()).value).toMatchObject({
      type: 'notification',
      notification: { kind: 'draft', draft: { body: 'hi', revision: 1 } },
    });
    hub.publishHumanRead(group.id, 'local-human', 2);
    expect((await frames.next()).value).toEqual({
      type: 'notification',
      notification: {
        kind: 'human-read',
        channelId: group.id,
        humanId: 'local-human',
        revision: 2,
      },
    });
    const pending = frames.next();
    abort.abort();
    expect((await pending).done).toBe(true);
    await store.appendMessage(group.id, text('three'));

    const resumed = hub
      .followChannel(group.id, 2, new AbortController().signal)
      [Symbol.asyncIterator]();
    expect((await resumed.next()).value).toEqual({ type: 'opened', cursor: 2 });
    expect((await resumed.next()).value).toMatchObject({ type: 'entry', entry: { revision: 3 } });
    await resumed.return?.(undefined);

    const refused = async (channelId: string, after: number) =>
      hub
        .followChannel(channelId, after, new AbortController().signal)
        [Symbol.asyncIterator]()
        .next();
    await expect(refused('missing', 0)).rejects.toMatchObject({ code: 'not-found' });
    await expect(refused(group.id, 99)).rejects.toMatchObject({ code: 'conflict' });
    await expect(refused(group.id, -1)).rejects.toMatchObject({ code: 'invalid' });
  });

  it('follows the Companion feed as typed frames, passing resume identity and refusals through', async () => {
    const requests: Request[] = [];
    let cancelled = false;
    const open = (request: Request): Response => {
      requests.push(request);
      if (new URL(request.url).searchParams.get('resume') === 'gone')
        return new Response('Subscription unavailable', { status: 404 });
      const encoder = new TextEncoder();
      return new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(
              encoder.encode(
                'event: companion/baseline\ndata: {"consumerId":"c1","bots":[]}\nid: c1\n\n' +
                  ': heartbeat\n\nevent: companion/message\ndata: {"botId":"ada"}\nid: c1\n\n',
              ),
            );
          },
          cancel() {
            cancelled = true;
          },
        }),
      );
    };
    const abort = new AbortController();
    const frames = followCompanion(open, 'r1', 'last', abort.signal);
    expect((await frames.next()).value).toEqual({
      type: 'baseline',
      value: { consumerId: 'c1', bots: [] },
      id: 'c1',
    });
    expect((await frames.next()).value).toEqual({
      type: 'message',
      value: { botId: 'ada' },
      id: 'c1',
    });
    const url = new URL(requests[0]!.url);
    expect(url.pathname).toBe('/api/botharness/companion');
    expect(url.search).toBe('?subscribe=1&resume=r1');
    expect(requests[0]!.headers.get('Last-Event-ID')).toBe('last');
    const pending = frames.next();
    abort.abort();
    expect((await pending).done).toBe(true);
    expect(cancelled).toBe(true);

    await expect(
      followCompanion(open, 'gone', '', new AbortController().signal).next(),
    ).rejects.toMatchObject({ name: 'LiveRefused', code: 'not-found' });
    await expect(
      followCompanion(open, 'x'.repeat(200), '', new AbortController().signal).next(),
    ).rejects.toMatchObject({ code: 'invalid' });
  });
});

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { LiveRefused, openLiveFrames, parseLiveFrame } from '../src/channels/live-frames.js';
import { createChannelLiveHub, type ChannelLiveHub } from '../src/channels/live.js';
import { createChannelStore } from '../src/channels/store.js';

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

  it('opens a Channel with its tail page, then entries and typed notifications, and reads pages fixed at a revision', async () => {
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
    for (const id of ['one', 'two', 'three']) await store.appendMessage(group.id, text(id));
    const hub = createChannelLiveHub(store);
    live = hub;
    hubs.push(hub);
    const abort = new AbortController();
    const frames = hub.followChannel(group.id, 2, abort.signal)[Symbol.asyncIterator]();
    const opened = (await frames.next()).value;
    expect(opened).toMatchObject({ type: 'opened', cursor: 3 });
    expect(opened.page.entries.map((entry: { revision: number }) => entry.revision)).toEqual([
      2, 3,
    ]);
    expect(opened.page.entries[1].message.id).toBe('three');
    expect(opened.page.hasOlder).toBe(true);
    expect(typeof opened.page.olderCursor).toBe('string');
    let baseline = (await frames.next()).value;
    while (baseline.type !== 'notification' || baseline.notification.kind !== 'draft-baseline')
      baseline = (await frames.next()).value;
    await store.appendMessage(group.id, text('four'));
    expect((await frames.next()).value).toMatchObject({
      type: 'entry',
      entry: { channelId: group.id, revision: 4, message: { id: 'four' } },
    });
    hub.publishHumanRead(group.id, 'local-human', 4);
    expect((await frames.next()).value).toEqual({
      type: 'notification',
      notification: {
        kind: 'human-read',
        channelId: group.id,
        humanId: 'local-human',
        revision: 4,
      },
    });
    const pending = frames.next();
    abort.abort();
    expect((await pending).done).toBe(true);

    const fixed = store.readHumanJournalPage(group.id, { through: 3, limit: 2 });
    expect(fixed?.entries.map((entry) => entry.revision)).toEqual([2, 3]);
    const older = store.readHumanJournalPage(group.id, { through: 4, before: 2, limit: 5 });
    expect(older?.entries.map((entry) => entry.revision)).toEqual([1]);
    expect(older?.hasOlder).toBe(false);
    expect(store.readHumanJournalPage(group.id, { through: 99 })).toBeUndefined();
    expect(store.readHumanJournalPage('missing', { through: 0 })).toBeUndefined();

    const refused = async (channelId: string, limit: number) =>
      hub
        .followChannel(channelId, limit, new AbortController().signal)
        [Symbol.asyncIterator]()
        .next();
    await expect(refused('missing', 50)).rejects.toMatchObject({ code: 'not-found' });
    await expect(refused(group.id, 0)).rejects.toMatchObject({ code: 'invalid' });
    await expect(refused(group.id, 9999)).rejects.toMatchObject({ code: 'invalid' });
  });
});

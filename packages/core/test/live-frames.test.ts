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
});

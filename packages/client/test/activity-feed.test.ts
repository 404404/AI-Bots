// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { createActivityFeed } from '../src/client/activity-feed.js';
import {
  createStore,
  type HumanAttentionItem,
  type HumanAttentionPage,
} from '../src/client/store.js';

const item = (id: string): HumanAttentionItem => ({
  id,
  category: 'action',
  kind: 'tool-approval',
  createdAt: '2026-10-17T00:00:00Z',
  botSlug: 'ada',
  summary: id,
});
afterEach(() => {
  localStorage.clear();
  vi.useRealTimers();
});

it('keeps three ordered sections and collapsed preference while arrivals refresh independently', async () => {
  let ids = ['one'];
  const activityPage = vi.fn(async () => ({ items: ids.map(item) }));
  const feed = createActivityFeed({ activityPage });
  expect(feed.visible()).toEqual(['action', 'replies', 'unread']);
  await feed.refresh();
  expect(activityPage.mock.calls).toHaveLength(3);
  feed.toggle('action');
  ids = ['one', 'two'];
  await feed.refresh();
  expect(feed.getSnapshot().pages.action.items).toHaveLength(2);
  expect(feed.getSnapshot().collapsed.action).toBe(true);
  expect(feed.getSnapshot().collapsed.replies).toBe(false);
  expect(createActivityFeed({ activityPage }).getSnapshot().collapsed.action).toBe(true);
});

it('rejects old search responses and old failures after a new query', async () => {
  let resolveOld!: (value: HumanAttentionPage) => void;
  let rejectOld!: (error: Error) => void;
  const activityPage = vi.fn(async (section: string, filters: { search?: string }) => {
    if (filters.search === 'old')
      return new Promise<HumanAttentionPage>((resolve, reject) => {
        if (section === 'action') resolveOld = resolve;
        else if (section === 'replies') rejectOld = reject;
        else resolve({ items: [] });
      });
    return { items: [item('new')] };
  });
  const feed = createActivityFeed({ activityPage });
  feed.setQuery({ search: 'old' });
  feed.setQuery({ search: 'new' });
  await feed.refresh();
  resolveOld({ items: [item('old')] });
  rejectOld(new Error('Old request failed'));
  await Promise.resolve();
  await Promise.resolve();
  expect(feed.getSnapshot().pages.action.items.map((x) => x.id)).toEqual(['new']);
  expect(feed.getSnapshot().pages.replies.error).toBeUndefined();
});

it('passes search to the owner, preserves filters and independently paginates without duplicates', async () => {
  const activityPage = vi.fn(async (_section: string, _filters: unknown, cursor?: string) =>
    cursor
      ? { items: [item('49'), item('50')] }
      : { items: Array.from({ length: 50 }, (_, i) => item(String(i))), nextCursor: 'page-2' },
  );
  const feed = createActivityFeed({ activityPage });
  feed.setQuery({ search: 'beyond first page', botSlug: 'ada', channelId: 'dm-ada' });
  await feed.refresh();
  expect(activityPage).toHaveBeenCalledWith(
    'replies',
    expect.objectContaining({
      search: 'beyond first page',
      botSlug: 'ada',
      channelId: 'dm-ada',
      mentionsFirst: true,
    }),
    undefined,
  );
  await feed.loadMore('action');
  expect(feed.getSnapshot().pages.action.items).toHaveLength(51);
  expect(feed.getSnapshot().pages.replies.items).toHaveLength(50);
  await feed.refresh();
  expect(feed.getSnapshot().pages.action.items).toHaveLength(51);
  feed.setQuery({ sort: 'oldest' });
  await feed.refresh();
  expect(activityPage).toHaveBeenCalledWith(
    'replies',
    expect.objectContaining({ sort: 'oldest', mentionsFirst: false }),
    undefined,
  );
});

it('preserves a failed page and retries it without hiding existing items', async () => {
  let fail = true;
  const activityPage = vi.fn(async (_section: string, _filters: unknown, cursor?: string) => {
    if (cursor && fail) throw new Error('Offline');
    return cursor ? { items: [item('two')] } : { items: [item('one')], nextCursor: 'more' };
  });
  const feed = createActivityFeed({ activityPage });
  await feed.refresh();
  await feed.loadMore('action');
  expect(feed.getSnapshot().pages.action.error).toBe('Offline');
  expect(feed.getSnapshot().pages.action.items).toHaveLength(1);
  fail = false;
  await feed.loadMore('action');
  expect(feed.getSnapshot().pages.action.items.map((x) => x.id)).toEqual(['one', 'two']);
  expect(feed.getSnapshot().pages.action.error).toBeUndefined();
});

it('disposes polling and ignores an in-flight response after the last surface closes', async () => {
  vi.useFakeTimers();
  let resolve!: (value: HumanAttentionPage) => void;
  const activityPage = vi.fn(async (section: string) =>
    section === 'action'
      ? new Promise<HumanAttentionPage>((done) => {
          resolve = done;
        })
      : { items: [] },
  );
  const feed = createActivityFeed({ activityPage });
  const release = feed.acquire();
  release();
  resolve({ items: [item('late')] });
  await Promise.resolve();
  await Promise.resolve();
  await vi.advanceTimersByTimeAsync(30_000);
  expect(activityPage).toHaveBeenCalledTimes(3);
  expect(feed.getSnapshot().pages.action.items).toEqual([]);
});

it('requeries on committed mute changes and rejects late pages without changing the view', async () => {
  const clientStore = createStore();
  let oldPage: ((value: HumanAttentionPage) => void) | undefined;
  let hold = false;
  const activityPage = vi.fn(async (section: string) => {
    if (section === 'action') return { items: [item('pending-request')] };
    if (hold && section === 'replies') {
      hold = false;
      return new Promise<HumanAttentionPage>((resolve) => {
        oldPage = resolve;
      });
    }
    return {
      items: clientStore.getSnapshot().roster.muted.includes('quiet') ? [] : [item('message')],
    };
  });
  const feed = createActivityFeed({ activityPage }, clientStore);
  feed.setQuery({ search: 'needle', channelId: 'quiet', sort: 'oldest' });
  feed.toggle('replies');
  const releasePage = feed.acquire();
  const releaseDock = feed.acquire();
  try {
    await feed.refresh();
    const query = feed.getSnapshot().query;
    hold = true;
    const old = feed.refresh();
    await vi.waitFor(() => expect(oldPage).toBeDefined());
    clientStore.setRosterState({ muted: ['quiet'] });
    await vi.waitFor(() => expect(feed.getSnapshot().pages.replies.items).toEqual([]));
    oldPage!({ items: [item('stale-message')] });
    await old;
    expect(feed.getSnapshot().pages.replies.items).toEqual([]);
    expect(feed.getSnapshot().pages.unread.items).toEqual([]);
    expect(feed.getSnapshot().pages.action.items[0]?.id).toBe('pending-request');
    expect(feed.getSnapshot().query).toEqual(query);
    expect(feed.getSnapshot().collapsed.replies).toBe(true);
    releasePage();
    clientStore.setRosterState({ muted: [] });
    await vi.waitFor(() => expect(feed.getSnapshot().pages.replies.items[0]?.id).toBe('message'));
    const calls = activityPage.mock.calls.length;
    clientStore.setRosterState({ pins: ['quiet'] });
    clientStore.setRosterState({ muted: [] });
    expect(activityPage.mock.calls.length).toBe(calls);
  } finally {
    releaseDock();
  }
  const calls = activityPage.mock.calls.length;
  clientStore.setRosterState({ muted: ['quiet'] });
  expect(activityPage.mock.calls.length).toBe(calls);
});

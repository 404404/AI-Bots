// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-native', () => import('./react-native-shim'));
vi.mock('react-native-svg', () => ({
  default: () => null,
  Path: () => null,
  Defs: () => null,
  LinearGradient: () => null,
  Rect: () => null,
  Stop: () => null,
}));
vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
vi.mock('react-native-reanimated', () => import('./reanimated-shim'));
vi.mock('expo-haptics', () => import('./expo-haptics-shim'));
vi.mock('expo-router', () => ({ useRouter: () => ({ push: () => undefined }) }));
vi.mock('../src/ui/bot-avatar', () => ({
  BotAvatar: ({ bot }: { bot: { slug: string } }) =>
    createElement('span', { 'data-testid': `avatar-${bot.slug}` }),
}));

import { createHostClient, type HostClient } from '../src/host/client';
import type { InboxSnapshot } from '../src/host/inbox';
import { createSectionCollapse, type SectionCollapse } from '../src/host/section-collapse';
import type { HumanAttentionItem } from '../src/host/wire';
import { ActivityFeed, activityCounts, feedRows } from '../src/ui/shell/activity-feed';
import { t } from '../src/ui/strings';
import { FakeHost } from './fake-host';
import inboxWire from './fixtures/inbox-wire.json';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

type Recorded = keyof typeof inboxWire.rpc;
const recorded = (name: Recorded): unknown => structuredClone(inboxWire.rpc[name].result);
const items = (name: Recorded): HumanAttentionItem[] =>
  (inboxWire.rpc[name].result as { value: { items: HumanAttentionItem[] } }).value.items;

const approval = items('humanAttention.action')[0]!;
const question = items('humanAttention.actionQuestion')[0]!;
const privateInput: HumanAttentionItem = { ...question, id: 'private-1', kind: 'private-input' };
const reply: HumanAttentionItem = {
  ...question,
  id: 'reply-1',
  kind: 'reply',
  category: 'replies',
};

const ready = (action: HumanAttentionItem[]): InboxSnapshot => ({
  status: 'ready',
  sections: { action, replies: [reply], unread: [], handled: [] },
});

let client: HostClient | undefined;
let root: Root | undefined;
let container: HTMLElement | undefined;
afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = undefined;
  client?.stop();
});

function host(): FakeHost {
  const fake = new FakeHost();
  fake.answers.set('userQuestionStatus', () => recorded('userQuestionStatus.pending'));
  fake.answers.set('userQuestionAnswer', () => recorded('userQuestionAnswer.accepted'));
  fake.answers.set('channelTimeline', () => recorded('channelTimeline.questionPending'));
  return fake;
}

async function settle(): Promise<void> {
  for (let tries = 0; tries < 20; tries += 1)
    await act(async () => new Promise((resolve) => setTimeout(resolve, 5)));
}

async function feed(
  fake: FakeHost,
  snapshot: InboxSnapshot,
  collapse = createSectionCollapse({ read: async () => undefined, write() {} }),
  hostId = 'host-one',
): Promise<HTMLElement> {
  act(() => root?.unmount());
  container?.remove();
  client?.stop();
  const answer = fake.answers.get('humanAttention');
  fake.answers.set('humanAttention', (args) => {
    const result = answer
      ? answer(args)
      : {
          ok: true,
          value: {
            items:
              snapshot.status === 'ready'
                ? snapshot.sections[args.category as keyof typeof snapshot.sections]
                : [],
          },
        };
    const value = result as { ok: boolean; value?: object };
    return value.ok ? { ...value, value: { ...value.value, queryVersion: 1 } } : value;
  });
  client = createHostClient({
    routes: ['https://studio.tailnet-example.ts.net'],
    credential: fake.credential,
    carrier: fake.carrier,
    backoff: () => 5,
    timeoutMs: 200,
  });
  client.start();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () =>
    root!.render(
      createElement(ActivityFeed, {
        hostId,
        collapse,
        client,
        inbox: undefined,
        snapshot,
        botSlugs: [question.botSlug, 'other-bot'],
        bot: () => undefined,
        onOpen: () => undefined,
      }),
    ),
  );
  await settle();
  return container;
}

function button(view: HTMLElement, label: string): HTMLButtonElement {
  const found = view.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
  if (found === null) throw new Error(`no button ${label}`);
  return found;
}

async function press(target: HTMLElement): Promise<void> {
  await act(async () => target.click());
  await settle();
}

const post = (view: HTMLElement, item: HumanAttentionItem) =>
  view.querySelector(`[data-testid="inbox-post-${item.id}"]`);

describe('Activity feed rows', () => {
  it('turns decidable actions into posts and keeps other items as rows', () => {
    const rows = feedRows(ready([question, approval, privateInput]), new Set(), []);
    expect(rows.map((row) => `${row.kind}:${row.key}`)).toEqual([
      'header:header-action',
      `post:${question.id}`,
      `post:${approval.id}`,
      'row:private-1',
      'header:header-replies',
      'row:reply-1',
      'header:header-unread',
      'empty:empty-unread',
    ]);
  });

  it('drops an answered post at once and keeps a refused one after the Host drops it', () => {
    const answered = feedRows(ready([question, approval]), new Set([question.id]), []);
    expect(answered.some((row) => row.key === question.id)).toBe(false);
    const kept = feedRows(ready([]), new Set(), [approval]);
    expect(kept.map((row) => row.key)).toContain(approval.id);
    expect(kept.some((row) => row.key === 'empty-action')).toBe(false);
  });

  it('filters to one section and keeps its header when it is empty', () => {
    const snapshot = ready([question, approval]);
    expect(
      feedRows(snapshot, new Set(), [], { section: 'replies', bot: undefined }).map(
        (row) => row.key,
      ),
    ).toEqual(['header-replies', 'reply-1']);
    expect(
      feedRows(snapshot, new Set(), [], { section: 'handled', bot: undefined }).map(
        (row) => row.key,
      ),
    ).toEqual(['header-handled', 'empty-handled']);
  });

  it('filters by Bot and counts what each section would show', () => {
    const other: HumanAttentionItem = { ...approval, id: 'other-1', botSlug: 'other-bot' };
    const snapshot = ready([question, other]);
    const rows = feedRows(snapshot, new Set(), [], { section: 'all', bot: 'other-bot' });
    expect(rows.map((row) => row.key)).toEqual([
      'header-action',
      'other-1',
      'header-replies',
      'empty-replies',
      'header-unread',
      'empty-unread',
    ]);
    expect(activityCounts(snapshot, new Set([question.id]), [], undefined)).toEqual({
      all: 2,
      action: 1,
      replies: 1,
      unread: 0,
      handled: 0,
    });
  });

  it('says nothing needs you when the action section is empty', () => {
    expect(feedRows(ready([]), new Set(), []).map((row) => row.kind)).toContain('empty');
  });
});

describe('Activity feed', () => {
  it('sends header sort and search choices to the Host and clears search on close', async () => {
    const fake = host();
    const queries: Record<string, unknown>[] = [];
    fake.answers.set('humanAttention', (args) => {
      queries.push(args);
      return { ok: true, value: { items: args.category === 'replies' ? [reply] : [] } };
    });
    const view = await feed(fake, ready([]));
    await press(button(view, t.activityOptions));
    await press(button(view, t.activitySortOldest));
    await press(button(view, t.cancel));
    expect(queries.at(-1)?.sort).toBe('oldest');
    await press(button(view, t.activitySearch));
    const field = view.querySelector('textarea')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(
        field,
        'budget',
      );
      field.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await settle();
    expect(queries.at(-1)?.search).toBe('budget');
    await press(button(view, t.close));
    expect(queries.at(-1)?.search).toBeUndefined();
  });

  it('applies options immediately, keeps them on dismissal and resets without confirmation', async () => {
    const fake = host();
    const queries: Record<string, unknown>[] = [];
    fake.answers.set('humanAttention', (args) => {
      queries.push(args);
      return { ok: true, value: { items: [] } };
    });
    const view = await feed(fake, ready([]));
    await press(button(view, t.activityOptions));
    expect(view.querySelector(`button[aria-label="${t.done}"]`)).toBeNull();
    await press(button(view, t.activitySortNewest));
    expect(queries.at(-1)?.sort).toBe('newest');
    expect(view.querySelector('[role="dialog"]')).not.toBeNull();
    await press(button(view, t.inboxSections.replies));
    expect(queries.at(-1)?.category).toBe('replies');
    expect(queries.at(-1)?.sort).toBe('newest');
    await press(button(view, t.cancel));
    expect(queries.at(-1)?.sort).toBe('newest');
    await press(button(view, t.activityOptions));
    expect(button(view, t.activitySortNewest).getAttribute('aria-checked')).toBe('true');
    await press(button(view, t.activityReset));
    expect(queries.at(-1)?.sort).toBeUndefined();
    expect(view.querySelector('[role="dialog"]')).not.toBeNull();
  });

  it('keeps filters behind the floating header entry instead of permanent chips', async () => {
    const view = await feed(host(), ready([question]));
    expect(view.querySelector(`button[aria-label="${t.filterChip(t.filterAll, 2)}"]`)).toBeNull();
    await press(button(view, t.activityOptions));
    expect(button(view, t.inboxSections.handled)).not.toBeNull();
  });
  it('preserves other sections and Hosts when toggled before preferences finish loading', async () => {
    const original = { 'host-one': ['replies'], 'host-two': ['unread'] };
    let saved: Record<string, string[]> = original;
    let loaded!: (value: unknown) => void;
    const collapse = createSectionCollapse({
      read: () =>
        new Promise((resolve) => {
          loaded = resolve;
        }),
      write: (value) => {
        saved = value;
      },
    });
    const view = await feed(host(), ready([question]), collapse);
    await press(button(view, t.sectionCount(t.inboxSections.action, 1)));
    expect(saved['host-two']).toEqual(['unread']);
    await act(async () => loaded(original));
    expect(post(view, question)).toBeNull();
    expect(view.querySelector('[data-testid="inbox-row-reply-1"]')).toBeNull();
    expect(saved['host-one']).toEqual(expect.arrayContaining(['action', 'replies']));
    expect(saved['host-two']).toEqual(['unread']);
  });

  it('restores collapsed sections on reopen without carrying them to another Host', async () => {
    let saved: Record<string, string[]> = {};
    const persistence = (): SectionCollapse =>
      createSectionCollapse({
        read: async () => saved,
        write: (next) => {
          saved = next;
        },
      });
    const view = await feed(host(), ready([question]), persistence());
    await press(button(view, t.sectionCount(t.inboxSections.action, 1)));
    expect(post(view, question)).toBeNull();
    const reopened = await feed(host(), ready([question, approval]), persistence());
    expect(post(reopened, question)).toBeNull();
    expect(post(reopened, approval)).toBeNull();
    expect(button(reopened, t.sectionCount(t.inboxSections.action, 2))).not.toBeNull();
    const otherHost = await feed(host(), ready([question]), persistence(), 'host-two');
    expect(post(otherHost, question)).not.toBeNull();
  });

  it('uses the Host scoped unread summary instead of filtering its last author', async () => {
    const fake = host();
    const unread: HumanAttentionItem = {
      ...reply,
      id: 'unread:team',
      category: 'unread',
      kind: 'channel-unread',
      botSlug: 'other-bot',
      channelName: 'Team',
      summary: 'Team update',
      unreadCount: 10,
    };
    fake.answers.set('humanAttention', (args) => ({
      ok: true,
      value: {
        items:
          args.category === 'unread'
            ? [{ ...unread, unreadCount: args.botSlug === question.botSlug ? 2 : 10 }]
            : [],
      },
    }));
    fake.answers.set('channelUnreadCounts', () => ({ ok: true, value: { channels: [] } }));
    const view = await feed(fake, {
      status: 'ready',
      sections: { action: [], replies: [], unread: [unread], handled: [] },
    });
    await press(button(view, t.activityOptions));
    await press(button(view, question.botSlug));
    await press(button(view, t.cancel));
    expect(button(view, t.sectionCount(t.inboxSections.unread, 2))).not.toBeNull();
    expect(view.querySelector('[data-testid="inbox-row-unread:team"]')).not.toBeNull();
    await press(button(view, t.activityOptions));
    await press(button(view, t.filterAllBots));
    await press(button(view, t.cancel));
    expect(button(view, t.sectionCount(t.inboxSections.unread, 10))).not.toBeNull();
  });

  it('shows three collapsible triage sections and keeps handled history behind its filter', async () => {
    const unread: HumanAttentionItem = {
      ...reply,
      id: 'unread:team',
      category: 'unread',
      kind: 'channel-unread',
      channelName: 'Team',
      summary: 'A new conversation',
      unreadCount: 10,
    };
    const done: HumanAttentionItem = { ...question, id: 'done-1', category: 'handled' };
    const view = await feed(host(), {
      status: 'ready',
      sections: { action: [question], replies: [reply], unread: [unread], handled: [done] },
    });
    expect(view.querySelector('[data-testid="inbox-row-done-1"]')).toBeNull();
    const actions = button(view, t.sectionCount(t.inboxSections.action, 1));
    await press(actions);
    expect(post(view, question)).toBeNull();
    expect(view.querySelector('[data-testid="inbox-row-reply-1"]')).not.toBeNull();
    await press(button(view, t.sectionCount(t.inboxSections.unread, 10)));
    expect(view.querySelector('[data-testid="inbox-row-unread:team"]')).toBeNull();
    await press(actions);
    expect(post(view, question)).not.toBeNull();
    await press(button(view, t.activityOptions));
    await press(button(view, t.inboxSections.handled));
    await press(button(view, t.cancel));
    expect(view.querySelector('[data-testid="inbox-row-done-1"]')).not.toBeNull();
    expect(post(view, question)).toBeNull();
  });

  it('answers a question in place and the post leaves the feed', async () => {
    const fake = host();
    const sent: Array<Record<string, unknown>> = [];
    fake.answers.set('userQuestionAnswer', (args) => {
      sent.push(args);
      return recorded('userQuestionAnswer.accepted');
    });
    const view = await feed(fake, ready([question]));
    expect(post(view, question)).not.toBeNull();
    await press(button(view, t.option('A', 'Teal')));
    await press(button(view, t.option('B', 'Biscuits')));
    await press(button(view, t.submitChoice));
    expect(sent).toHaveLength(1);
    expect(post(view, question)).toBeNull();
    expect(view.textContent).toContain(t.inboxEmpty);
  });

  it('filters the feed through its header panel', async () => {
    const view = await feed(host(), ready([question]));
    expect(post(view, question)).not.toBeNull();
    await press(button(view, t.activityOptions));
    await press(button(view, t.inboxSections.replies));
    await press(button(view, t.cancel));
    expect(post(view, question)).toBeNull();
    expect(button(view, t.sectionCount(t.inboxSections.replies, 1))).not.toBeNull();
    await press(button(view, t.activityOptions));
    await press(button(view, t.filterAll));
    await press(button(view, t.cancel));
    expect(post(view, question)).not.toBeNull();
  });

  it('shows handled history only when selected and keeps personal messages in the default view', async () => {
    const done: HumanAttentionItem = { ...question, id: 'done-1', category: 'handled' };
    const view = await feed(host(), {
      status: 'ready',
      sections: { action: [], replies: [reply], unread: [], handled: [done] },
    });
    const replied = view.querySelector('[data-testid="inbox-row-reply-1"]')!;
    expect(replied.textContent).toContain(`${t.kind.reply ?? t.otherKind} · ${reply.botSlug}`);
    expect(replied.textContent?.split(reply.summary).length).toBe(2);
    await press(button(view, t.activityOptions));
    await press(button(view, t.inboxSections.handled));
    await press(button(view, t.cancel));
    const handled = view.querySelector('[data-testid="inbox-row-done-1"]')!;
    expect(handled.textContent).toContain(
      `${t.kind['user-question']} · ${done.botSlug} · ${done.summary}`,
    );
  });

  it('keeps a post that lost to another device and says so', async () => {
    const fake = host();
    const view = await feed(fake, ready([question]));
    fake.answers.set('userQuestionAnswer', () => recorded('userQuestionAnswer.refused'));
    fake.answers.set('userQuestionStatus', () => recorded('userQuestionStatus.answered'));
    fake.answers.set('channelTimeline', () => recorded('channelTimeline.questionAnswered'));
    await press(button(view, t.option('A', 'Teal')));
    await press(button(view, t.option('B', 'Biscuits')));
    await press(button(view, t.submitChoice));
    expect(post(view, question)).not.toBeNull();
    expect(view.querySelector('[data-testid="card-line"]')?.getAttribute('aria-label')).toContain(
      t.elsewhere(t.cardAnswered),
    );
  });
});

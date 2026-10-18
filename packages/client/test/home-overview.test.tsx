// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
vi.mock('../src/client/overview-usage-view.js', () => ({ OverviewUsageView: () => null }));
vi.mock('../src/client/avatar.js', () => ({
  PersonaBotAvatar: () => createElement('span', { 'data-avatar': '' }),
  normalizePersonaBotActivity: (state: string) => state,
  personaBotActivityLabel: (state: string) => state,
}));
import { HomeOverview, homeActiveBots } from '../src/client/home-overview.js';
import { store, createStore, type BotSummary, type ChannelSummary } from '../src/client/store.js';
import { createActions } from '../src/client/actions.js';
import { createDockPanelRegistry } from '../src/client/dock-panels.js';
import { zhTranslate as t } from '../src/client/locale.js';
const bot = (slug: string, aggregateState = 'idle'): BotSummary => ({
  slug,
  displayName: slug,
  aggregateState,
  roles: [],
  workspaces: [],
  createdAt: '2026-10-01T00:00:00Z',
});
const channel = (slug: string, at: string, human = false): ChannelSummary => ({
  id: 'dm-' + slug,
  type: 'dm',
  name: slug,
  botSlug: slug,
  members: [slug],
  createdAt: at,
  updatedAt: '2026-10-18T20:00:00Z',
  latestMessage: {
    id: slug,
    at,
    author: human ? { kind: 'human' } : { kind: 'bot', slug },
    body: 'test',
  },
});
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
afterEach(() => {
  store.setRoster([], []);
  store.setActivitySync('live');
  vi.restoreAllMocks();
});
it('uses execution and recorded Bot activity, never channel updates, Human messages, or mere existence', () => {
  const bots = [
    bot('recent'),
    bot('working', 'working'),
    bot('empty'),
    bot('human'),
    { ...bot('deleted', 'working'), deleted: true },
    bot('tie'),
  ];
  const at = '2026-10-18T10:00:00Z';
  expect(
    homeActiveBots(bots, [
      channel('recent', at),
      channel('tie', at),
      channel('human', at, true),
    ]).map((x) => x.bot.slug),
  ).toEqual(['working', 'recent', 'tie']);
});
it('opens a current Bot through the existing DM action, reveals Messages, and distinguishes stale activity from idle', async () => {
  const actions = createActions(async () => {
    throw Error('unexpected RPC');
  }, createStore());
  const open = vi.spyOn(actions, 'openBot').mockResolvedValue();
  const registry = createDockPanelRegistry();
  const reveal = vi.spyOn(registry, 'open');
  store.setRoster([bot('ada', 'working'), bot('bob')], [channel('bob', '2026-10-18T10:00:00Z')]);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () => root.render(createElement(HomeOverview, { actions, registry, t })));
    expect(host.querySelectorAll('[data-avatar]')).toHaveLength(2);
    await act(async () => host.querySelector<HTMLButtonElement>('[data-home-bot=ada]')!.click());
    expect(open).toHaveBeenCalledWith('ada');
    expect(reveal).toHaveBeenCalledWith('bh:channel-body');
    await act(async () => store.setActivitySync('stale'));
    expect(host.querySelector('[role=status]')?.textContent).toBe(t('home.activityUnavailable'));
    expect(host.textContent).not.toContain('working');
    await act(async () => store.setRoster([{ ...bot('ada'), deleted: true }], []));
    expect(host.querySelector('[data-home-bot=ada]')).toBeNull();
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});

it('keeps canonical completed activity after a Human replaces the Channel preview', () => {
  const at = Date.parse('2026-10-18T10:00:00Z');
  const bots = [{ ...bot('completed'), lastActivityAt: at }, bot('never-worked')];
  expect(
    homeActiveBots(bots, [channel('completed', new Date(at + 1000).toISOString(), true)]).map(
      ({ bot, at }) => [bot.slug, at],
    ),
  ).toEqual([['completed', at]]);
});

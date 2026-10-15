// @vitest-environment jsdom
import { act, createElement, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-native', () => import('./react-native-shim'));
vi.mock('../src/ui/bot-avatar', () => ({
  BotAvatar: ({ bot }: { bot: { slug: string } }) =>
    createElement('span', { 'data-testid': `avatar-${bot.slug}` }),
}));

import type { RosterView } from '../src/host/client';
import { SearchResults } from '../src/ui/shell/search-results';
import { openConversation } from '../src/ui/shell/open-conversation';
import { t } from '../src/ui/strings';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let root: Root | undefined;
let host: HTMLElement | undefined;
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = undefined;
});

async function render(element: ReactElement): Promise<HTMLElement> {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(element));
  return host;
}

const roster: RosterView = {
  bots: [
    {
      slug: 'ada',
      displayName: 'Ada',
      roles: [],
      computerAccess: false,
      browserAccess: false,
      state: 'idle',
      paused: false,
      dmChannelId: 'dm-ada',
      preview: 'Done',
    },
  ],
  channels: [{ id: 'launch-team', name: 'Launch team', memberCount: 3, members: [] }],
};

const buttons = (view: HTMLElement) =>
  [...view.querySelectorAll('button')].map((node) => node.getAttribute('aria-label'));

describe('Search tab', () => {
  it('opens the chat of the result the Human taps', async () => {
    const router = { push: vi.fn() };
    const search = (query: string) =>
      render(
        <SearchResults
          roster={roster}
          action={[]}
          query={query}
          onOpen={(row) => openConversation(router, row)}
        />,
      );

    const bot = await search('ad');
    expect(buttons(bot)).toEqual(['Ada, Done']);
    await act(async () => bot.querySelector('button')!.click());
    expect(router.push).toHaveBeenLastCalledWith({
      pathname: '/dm/[slug]',
      params: { slug: 'ada' },
    });
    act(() => root?.unmount());

    const channel = await search('LAUNCH');
    await act(async () => channel.querySelector('button')!.click());
    expect(router.push).toHaveBeenLastCalledWith({
      pathname: '/full-client',
      params: { target: 'channel', channelId: 'launch-team' },
    });
  });

  it('says what to type before a query and when nothing matches', async () => {
    const empty = await render(
      <SearchResults roster={roster} action={[]} query="" onOpen={() => {}} />,
    );
    expect(empty.textContent).toBe(t.searchHint);
    act(() => root?.unmount());

    const none = await render(
      <SearchResults roster={roster} action={[]} query=" zed " onOpen={() => {}} />,
    );
    expect(none.textContent).toBe(t.searchNoMatch('zed'));
    expect(none.querySelector('button')).toBeNull();
  });
});

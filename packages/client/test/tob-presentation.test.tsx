// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import { PersonaBotAvatar } from '../src/client/avatar.js';
import { BotModePrefs } from '../src/client/bot-mode-prefs.js';
import { parseBotSummary } from '../src/client/bridge.js';
import { createStore, type BotSummary } from '../src/client/store.js';
import { bindTobPresentation } from '../src/client/tob-presentation.js';

const bot: BotSummary = {
  slug: 'protected-steward',
  displayName: 'Tob',
  roles: [],
  aggregateState: 'idle',
  workspaces: [],
  createdAt: '',
  tob: { defaultName: true, defaultAvatar: true },
};
const channel = {
  id: 'dm',
  type: 'dm' as const,
  botSlug: bot.slug,
  members: [bot.slug],
  name: 'Tob',
  createdAt: '',
  updatedAt: '',
};
const disposers: (() => void)[] = [];
afterEach(() => {
  while (disposers.length) disposers.pop()!();
});

function fixture() {
  const store = createStore();
  const prefs = new BotModePrefs();
  const { tob: _tob, ...ordinary } = bot;
  store.setRoster([bot, { ...ordinary, slug: 'ordinary' }], [channel]);
  disposers.push(
    bindTobPresentation({
      bot: (slug) => store.getSnapshot().bots.find((item) => item.slug === slug),
      icon: () => prefs.source.getSnapshot().botIcon,
      subscribe(listener) {
        const offStore = store.subscribe(listener),
          offPrefs = prefs.source.subscribe(listener);
        return () => {
          offStore();
          offPrefs();
        };
      },
    }),
  );
  return { store, prefs };
}

describe('protected Tob presentation', () => {
  it('localizes the canonical default and DM title through locale changes and fresh readback', () => {
    const { store } = fixture();
    store.setDefaultTobName('托布');
    store.select({ kind: 'channel', channelId: channel.id });
    store.setConversation({ channel });
    expect(store.getSnapshot().bots.map((item) => item.displayName)).toEqual(['托布', 'Tob']);
    expect(store.getSnapshot().channels[0]?.name).toBe('托布');
    expect(store.getSnapshot().conversation.channel?.name).toBe('托布');
    store.setRoster([bot], [channel]);
    expect(store.getSnapshot().bots[0]?.displayName).toBe('托布');
    store.setDefaultTobName('Tob');
    expect(store.getSnapshot().bots[0]?.displayName).toBe('Tob');
    expect(store.getSnapshot().conversation.channel?.name).toBe('Tob');
    store.upsertBot({
      ...bot,
      displayName: '小助手',
      tob: { defaultName: false, defaultAvatar: true },
    });
    store.setDefaultTobName('托布');
    expect(store.getSnapshot().bots[0]?.displayName).toBe('小助手');
    expect(store.getSnapshot().channels[0]?.name).toBe('小助手');
    store.upsertBot({ ...bot, tob: { defaultName: false, defaultAvatar: true } });
    expect(store.getSnapshot().bots[0]?.displayName).toBe('Tob');
  });

  it('parses explicit Host presentation metadata without guessing from a Bot name', () => {
    expect(parseBotSummary(bot)?.tob).toEqual(bot.tob);
    expect(parseBotSummary({ ...bot, tob: undefined })?.tob).toBeUndefined();
    expect(
      parseBotSummary({ ...bot, tob: { defaultName: 'yes', defaultAvatar: true } })?.tob,
    ).toBeUndefined();
  });

  it('updates existing avatar surfaces with system icon preferences and preserves custom avatars', () => {
    const { store, prefs } = fixture();
    const node = document.createElement('div');
    const root = createRoot(node);
    disposers.push(() => {
      act(() => root.unmount());
    });
    const render = () =>
      root.render(
        createElement(PersonaBotAvatar, {
          personaBotId: bot.slug,
          name: store.getSnapshot().bots[0]!.displayName,
          size: 32,
        }),
      );
    act(render);
    expect(node.querySelector('[data-media="system"]')).not.toBeNull();
    act(() => store.setDefaultTobName('托布'));
    expect(node.querySelector('[role="img"]')?.getAttribute('aria-label')).toContain('托布');
    act(() => prefs.setBotIcon('bot'));
    expect(node.querySelector('.bh-bot-icon svg')).not.toBeNull();
    act(() => prefs.setBotIcon('blob'));
    expect(node.querySelector('.bh-bot-icon svg')).not.toBeNull();
    act(() => prefs.setBotIcon('mascot'));
    expect(node.querySelector('.bh-bot-icon img')).not.toBeNull();
    act(() =>
      store.upsertBot({
        ...bot,
        avatar: 'custom.png',
        tob: { defaultName: true, defaultAvatar: false },
      }),
    );
    expect(node.querySelector('.bh-bot-icon')).toBeNull();
    expect(node.querySelector('img')?.getAttribute('src')).toBe('custom.png');
    act(() => prefs.setBotIcon('simple'));
    expect(node.querySelector('img')?.getAttribute('src')).toBe('custom.png');
    act(() => store.upsertBot(bot));
    expect(node.querySelector('[data-media="system"]')).not.toBeNull();
  });

  it('renders unsaved editor previews without substituting the canonical icon', () => {
    fixture();
    const markup = renderToStaticMarkup(
      createElement(PersonaBotAvatar, {
        personaBotId: bot.slug,
        name: '托布',
        src: 'draft.png',
        preview: true,
        size: 32,
      }),
    );
    expect(markup).not.toContain('data-media="system"');
    expect(markup).toContain('src="draft.png"');
  });

  it('keeps same-named ordinary Bot avatars independent from the system icon', () => {
    fixture();
    const markup = renderToStaticMarkup(
      createElement(PersonaBotAvatar, {
        personaBotId: 'ordinary',
        name: 'Tob',
        size: 32,
      }),
    );
    expect(markup).not.toContain('data-media="system"');
  });
});

// @vitest-environment jsdom
import { act, createElement, type ReactElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  IconPanelLeftOutlineRegular: () => null,
}));
vi.mock('../src/client/bot-main.js', () => ({
  BotPanel: () => createElement('div', { 'data-conversation': true }, 'Existing composer'),
}));
vi.mock('../src/client/bot-sidebar.js', () => ({
  BotSidebar: () =>
    createElement(
      'div',
      { className: 'bh-region' },
      createElement(
        'button',
        { className: 'bh-contact', onClick: () => store.select({ kind: 'bot', slug: 'alpha' }) },
        'Alpha',
      ),
      createElement(
        'button',
        {
          className: 'bh-channel-row',
          onClick: () => store.select({ kind: 'channel', channelId: 'group' }),
        },
        'Group',
      ),
    ),
}));

import { MobileBotPanel, mountMobileBotShell } from '../src/client/mobile-bot-panel.js';
import { MOBILE_BOT_QUERY } from '../src/client/mobile-viewport.js';
import {
  clearConversationDrafts,
  useConversationDraft,
  conversationDraftKey,
} from '../src/client/conversation-draft.js';
import { en, zhTranslate, type BotHarnessTranslate } from '../src/client/locale.js';
import { store } from '../src/client/store.js';
import { BotModePrefs } from '../src/client/bot-mode-prefs.js';
import type { BridgeActions } from '../src/client/actions.js';

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
let mobile = true;
const english = new Map(Object.entries(en));
const enTranslate: BotHarnessTranslate = (key) => english.get(key) ?? key;
const viewportListeners = new Set<() => void>();

beforeEach(() => {
  mobile = true;
  viewportListeners.clear();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({
      get matches() {
        return mobile;
      },
      addEventListener: (_event: string, listener: () => void) => viewportListeners.add(listener),
      removeEventListener: (_event: string, listener: () => void) =>
        viewportListeners.delete(listener),
    })),
  );
  store.select(undefined);
  clearConversationDrafts();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

function click(name: string): void {
  const button = [...container.querySelectorAll('button')].find(
    (item) => item.textContent?.trim() === name,
  );
  expect(button, name).toBeDefined();
  act(() => button?.click());
}

describe('Mobile Bot navigation', () => {
  function renderPanel(t = enTranslate) {
    const exitBotMode = vi.fn();
    const openBotSettings = vi.fn();
    const prefs = new BotModePrefs();
    const actions = {
      openActivityCenter: async () => {
        store.select({ kind: 'inbox' });
      },
    };
    act(() =>
      root.render(
        createElement(MobileBotPanel, {
          actions: actions as BridgeActions,
          prefs,
          channelSidebar: { entries: [] } as never,
          useBotModePrefs: (() => prefs.source.getSnapshot()) as never,
          t,
          exitBotMode,
          openBotSettings,
          setSortMode: vi.fn(),
          setSectionSortMode: vi.fn(),
        }),
      ),
    );
    return { exitBotMode, openBotSettings };
  }

  it('opens DM and Group, hides bottom navigation in chat and restores the exact list node/scroll', () => {
    renderPanel();
    expect(window.matchMedia).toHaveBeenCalledWith(MOBILE_BOT_QUERY);
    const list = container.querySelector<HTMLElement>('.bh-region')!;
    list.scrollTop = 238;
    click('Alpha');
    expect(container.querySelector('.bh-mobile-shell')?.getAttribute('data-page')).toBe(
      'conversation',
    );
    expect(container.querySelector('.bh-mobile-nav')).toBeNull();
    click('Back to conversations');
    expect(store.getSnapshot().selection).toBeUndefined();
    expect(container.querySelector('.bh-region')).toBe(list);
    expect(list.scrollTop).toBe(238);
    click('Group');
    expect(store.getSnapshot().selection).toEqual({ kind: 'channel', channelId: 'group' });
    click('Back to conversations');
    click('Alpha');
    expect(container.querySelector('.bh-mobile-shell')?.getAttribute('data-page')).toBe(
      'conversation',
    );
  });

  it('connects only existing top-level actions and restores the desktop component on resize', () => {
    const { exitBotMode, openBotSettings } = renderPanel();
    expect(container.querySelectorAll('.bh-mobile-nav button')).toHaveLength(3);
    click('Bot settings');
    expect(openBotSettings).toHaveBeenCalledOnce();
    click('Exit Bot mode');
    expect(exitBotMode).toHaveBeenCalledOnce();
    act(() => {
      mobile = false;
      for (const listener of viewportListeners) listener();
    });
    expect(container.querySelector('.bh-mobile-shell')).toBeNull();
    expect(container.textContent).toBe('Existing composer');
  });

  it('opens an already selected conversation from the list after restore or rotation', () => {
    store.select({ kind: 'bot', slug: 'alpha' });
    renderPanel();
    expect(container.querySelector('.bh-mobile-shell')?.getAttribute('data-page')).toBe('list');
    click('Alpha');
    expect(container.querySelector('.bh-mobile-shell')?.getAttribute('data-page')).toBe(
      'conversation',
    );
  });

  it('provides translated touch and keyboard button names', () => {
    renderPanel(zhTranslate);
    expect(container.querySelector('nav')?.getAttribute('aria-label')).toBe('Bot 模式导航');
    click('Alpha');
    click('返回会话列表');
    expect(container.querySelectorAll('.bh-mobile-nav button')).toHaveLength(3);
  });

  it('owns only the measured native sidebar attribute and removes it on disposal', () => {
    container.innerHTML = '<div><aside><nav></nav></aside><main><section></section></main></div>';
    const section = container.querySelector('section')!;
    const sidebar = container.querySelector('aside')!;
    const release = mountMobileBotShell(section);
    expect(sidebar.getAttribute('data-bh-mobile-sidebar')).toBe('true');
    expect(section.style.getPropertyValue('--bh-mobile-height')).not.toBe('');
    release();
    expect(sidebar.hasAttribute('data-bh-mobile-sidebar')).toBe(false);
    expect(section.style.getPropertyValue('--bh-mobile-height')).toBe('');
  });

  it('tracks visual viewport keyboard contraction and removes its listeners on exit', () => {
    const viewport = new EventTarget();
    Object.assign(viewport, { height: 520, offsetTop: 24 });
    vi.stubGlobal('visualViewport', viewport);
    const release = mountMobileBotShell(container);
    expect(container.style.getPropertyValue('--bh-mobile-height')).toBe('520px');
    expect(container.style.getPropertyValue('--bh-mobile-top')).toBe('24px');
    Object.assign(viewport, { height: 844, offsetTop: 0 });
    viewport.dispatchEvent(new Event('resize'));
    expect(container.style.getPropertyValue('--bh-mobile-height')).toBe('844px');
    release();
    viewport.dispatchEvent(new Event('scroll'));
    expect(container.style.getPropertyValue('--bh-mobile-height')).toBe('');
  });
});

describe('Conversation drafts', () => {
  it('preserves text, functional updates and mention context across unmounts without leaking to another Channel', () => {
    function Draft({ scope }: { scope: string }): ReactElement {
      const [text, setText] = useConversationDraft(scope, 'text', '');
      const [mentions, setMentions] = useConversationDraft(scope, 'mentions', []);
      return createElement(
        'button',
        {
          onClick: () => {
            setText((previous) => `${previous}draft`);
            setMentions([{ botSlug: 'alpha', label: 'Alpha', start: 0, end: 5 }]);
          },
        },
        `${scope}:${text}:${mentions.length}`,
      );
    }
    act(() => root.render(createElement(Draft, { key: 'dm', scope: 'dm' })));
    click('dm::0');
    act(() => root.render(createElement(Draft, { key: 'group', scope: 'group' })));
    expect(container.textContent).toBe('group::0');
    act(() => root.render(createElement(Draft, { key: 'dm', scope: 'dm' })));
    expect(container.textContent).toBe('dm:draft:1');
    click('dm:draft:1');
    expect(container.textContent).toBe('dm:draftdraft:1');
  });

  it('uses stable bot identity before the DM load resolves', () => {
    store.select({ kind: 'bot', slug: 'alpha' });
    expect(conversationDraftKey(store.getSnapshot())).toBe('bot:alpha');
    store.select({ kind: 'channel', channelId: 'group' });
    expect(conversationDraftKey(store.getSnapshot())).toBe('channel:group');
  });

  it('restores reply, channel refs and uploads and keeps late failures in the originating draft', () => {
    let restoreFailedSend: (() => void) | undefined;
    function Draft({ scope }: { scope: string }): ReactElement {
      const [text, setText] = useConversationDraft(scope, 'text', '');
      const [reply, setReply] = useConversationDraft(scope, 'reply', undefined);
      const [refs, setRefs] = useConversationDraft(scope, 'channelRefs', []);
      const [uploads, setUploads] = useConversationDraft(scope, 'uploads', []);
      return createElement(
        'button',
        {
          onClick: () => {
            setReply({
              id: 'reply',
              at: '2026-10-12T00:00:00Z',
              author: { kind: 'human' },
              body: 'Reply',
            });
            setRefs([{ channelId: 'group', label: 'Group', start: 0, end: 6 }]);
            setUploads([{ id: 'upload', file: new File(['hello'], 'hello.txt'), status: 'ready' }]);
            restoreFailedSend = () => setText('failed send');
          },
        },
        `${scope}:${text}:${reply?.id ?? ''}:${refs.length}:${uploads.length}`,
      );
    }
    act(() => root.render(createElement(Draft, { key: 'dm', scope: 'dm' })));
    click('dm:::0:0');
    act(() => root.render(createElement(Draft, { key: 'group', scope: 'group' })));
    act(() => restoreFailedSend?.());
    expect(container.textContent).toBe('group:::0:0');
    act(() => root.render(createElement(Draft, { key: 'dm', scope: 'dm' })));
    expect(container.textContent).toBe('dm:failed send:reply:1:1');
  });
});

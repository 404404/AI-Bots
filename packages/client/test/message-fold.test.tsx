// @vitest-environment jsdom
import { act, createElement, useSyncExternalStore } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  Switch: ({
    checked,
    onChange,
    label,
  }: {
    checked: boolean;
    onChange(value: boolean): void;
    label: string;
  }) =>
    createElement('input', {
      type: 'checkbox',
      checked,
      'aria-label': label,
      onChange: (event: { target: { checked: boolean } }) => onChange(event.target.checked),
    }),
  IconChevronDownOutlineRegular: () => null,
  Input: () => null,
  Button: () => null,
  Menu: () => null,
}));

import { BotModePrefs, type BotModeScope } from '../src/client/bot-mode-prefs.js';
import { AutoFoldLongMessagesSetting } from '../src/client/bot-mode-setting-rows.js';
import { MessageAutoFoldContext, MessageFold } from '../src/client/message-fold.js';
import { zhTranslate } from '../src/client/locale.js';

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(800);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});
function content(id: string, enabled = true) {
  return createElement(MessageFold, {
    messageId: id,
    enabled,
    t: zhTranslate,
    children: createElement('p', null, 'Complete long message'),
  });
}
function Harness({ prefs, id }: { prefs: BotModePrefs; id: string }) {
  const snapshot = useSyncExternalStore(prefs.source.subscribe, prefs.source.getSnapshot);
  return createElement(
    MessageAutoFoldContext.Provider,
    { value: snapshot.autoFoldLongMessages },
    createElement(AutoFoldLongMessagesSetting, {
      t: zhTranslate,
      useBotModePrefs: ((select: (value: typeof snapshot) => unknown) => select(snapshot)) as never,
      setAutoFoldLongMessages: (enabled: boolean) => prefs.setAutoFoldLongMessages(enabled),
    } as never),
    content(id),
  );
}

describe('long message preference', () => {
  it('keeps a long message fully open by default without an expand control', () => {
    act(() => root.render(content('default-open')));
    expect(container.querySelector('[data-message-fold]')?.getAttribute('data-message-fold')).toBe(
      'open',
    );
    expect(container.querySelector('[data-message-fold-toggle]')).toBeNull();
    expect(container.textContent).toContain('Complete long message');
  });

  it('applies the Messages switch, persists through the existing Host owner, and restores on fresh prefs', () => {
    let saved = false;
    const set = vi.fn(async (_field: string, value: unknown) => {
      saved = value === true;
    });
    const host: BotModeScope = {
      getSnapshot: () => ({
        status: 'ready',
        writable: true,
        mode: 'host',
        user: {},
        value: {
          developerMode: false,
          motionPreference: 'system',
          botIcon: 'mascot',
          sortMode: 'updated',
          sortModes: {},
          autoFoldLongMessages: saved,
        },
      }),
      subscribe: () => () => {},
      set,
      mutate: async () => {},
    };
    const prefs = new BotModePrefs();
    prefs.attach(host);
    act(() => root.render(createElement(Harness, { prefs, id: 'switch-message' })));
    const input = container.querySelector('input')!;
    expect(input.checked).toBe(false);
    act(() => input.click());
    expect(set).toHaveBeenCalledWith('autoFoldLongMessages', true);
    expect(container.querySelector('[data-message-fold]')?.getAttribute('data-message-fold')).toBe(
      'folded',
    );
    const fresh = new BotModePrefs();
    fresh.attach(host);
    expect(fresh.source.getSnapshot().autoFoldLongMessages).toBe(true);
    act(() => root.render(createElement(Harness, { prefs: fresh, id: 'restored-message' })));
    expect(container.querySelector('input')?.checked).toBe(true);
    expect(container.querySelector('[data-message-fold]')?.getAttribute('data-message-fold')).toBe(
      'folded',
    );
    act(() => container.querySelector('input')!.click());
    expect(container.querySelector('[data-message-fold]')?.getAttribute('data-message-fold')).toBe(
      'open',
    );
    expect(container.querySelector('[data-message-fold-toggle]')).toBeNull();
    expect(set).toHaveBeenLastCalledWith('autoFoldLongMessages', false);
  });

  it('preserves manual expansion across preference changes and remounts', () => {
    const prefs = new BotModePrefs();
    prefs.setAutoFoldLongMessages(true);
    act(() => root.render(createElement(Harness, { prefs, id: 'manual-expansion' })));
    act(() => container.querySelector<HTMLButtonElement>('[data-message-fold-toggle]')!.click());
    expect(container.querySelector('[data-message-fold]')?.getAttribute('data-message-fold')).toBe(
      'open',
    );
    act(() => prefs.setAutoFoldLongMessages(false));
    act(() => prefs.setAutoFoldLongMessages(true));
    expect(container.querySelector('[data-message-fold]')?.getAttribute('data-message-fold')).toBe(
      'open',
    );
    act(() => root.render(null));
    act(() => root.render(createElement(Harness, { prefs, id: 'manual-expansion' })));
    expect(
      container.querySelector('[data-message-fold-toggle]')?.getAttribute('aria-expanded'),
    ).toBe('true');
  });

  it('keeps ineligible messages open even when auto folding is enabled', () => {
    act(() =>
      root.render(
        createElement(
          MessageAutoFoldContext.Provider,
          { value: true },
          content('ineligible', false),
        ),
      ),
    );
    expect(container.querySelector('[data-message-fold]')?.getAttribute('data-message-fold')).toBe(
      'open',
    );
    expect(container.querySelector('[data-message-fold-toggle]')).toBeNull();
  });
});

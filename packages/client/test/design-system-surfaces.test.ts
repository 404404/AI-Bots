// @vitest-environment jsdom
import { act, createElement, createRef, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  IconChevronDownOutlineRegular: () => null,
  Tooltip: ({ children }: { children: ReactNode }) => children,
}));

import type {
  ChannelSidebarEntry,
  ChannelSidebarEntryProps,
} from '../src/client/channel-sidebar.js';
import { ChannelSidebarEntrySection } from '../src/client/channel-sidebar-view.js';
import { IconButton } from '../src/client/ds/icon-button.js';
import { PanelHeader } from '../src/client/ds/panel-header.js';

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

function render(node: ReactNode): void {
  act(() => root.render(node));
}

function button(name: string): HTMLButtonElement {
  const match = [...host.querySelectorAll<HTMLButtonElement>('button')].find(
    (candidate) =>
      (candidate.getAttribute('aria-label') ?? candidate.textContent?.trim() ?? '') === name,
  );
  if (match === undefined) throw new Error(`No button named ${name}`);
  return match;
}

describe('design-system surfaces', () => {
  it('names an icon button and forwards its ref and state', () => {
    const ref = createRef<HTMLButtonElement>();
    const onClick = vi.fn();
    render(
      createElement(
        IconButton,
        { ref, 'aria-label': 'Add', 'aria-expanded': true, onClick, size: 'row' },
        '+',
      ),
    );
    const add = button('Add');
    expect(add.type).toBe('button');
    expect(add.getAttribute('aria-expanded')).toBe('true');
    expect(ref.current).toBe(add);
    act(() => add.click());
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('renders a disclosure header as one button named by its label', () => {
    const onToggle = vi.fn();
    render(
      createElement(PanelHeader, {
        label: 'Sessions',
        badge: createElement('span', null, '3'),
        action: createElement(IconButton, { 'aria-label': 'Settings' }, '⚙'),
        disclosure: {
          expanded: false,
          controls: 'body',
          disabled: false,
          chevron: true,
          onToggle,
        },
      }),
    );
    const head = button('Sessions3');
    expect(head.getAttribute('aria-expanded')).toBe('false');
    expect(head.getAttribute('aria-controls')).toBe('body');
    act(() => head.click());
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(button('Settings')).toBeDefined();
  });

  it('renders a static header without a toggle', () => {
    render(createElement(PanelHeader, { label: 'Members' }));
    expect(host.querySelectorAll('button')).toHaveLength(0);
    expect(host.querySelector('[data-panel-label]')?.textContent).toBe('Members');
  });

  it('expands a Channel sidebar entry from its header', () => {
    const entry: ChannelSidebarEntry = {
      id: 'sessions',
      label: 'Sessions',
      scope: 'personabot',
      component: () => createElement('p', null, 'session list'),
      headerAction: () => createElement(IconButton, { 'aria-label': 'New session' }, '+'),
    };
    const entryProps = {
      scope: 'personabot',
      channelId: 'dm-ada',
      botSlug: 'ada',
      actions: {},
      t: (key: string) => key,
    } as unknown as ChannelSidebarEntryProps;
    let expanded = false;
    const draw = () =>
      render(
        createElement(ChannelSidebarEntrySection, {
          entry,
          expanded,
          entryProps,
          onToggle: () => {
            expanded = !expanded;
            draw();
          },
        }),
      );
    draw();
    const head = button('Sessions');
    expect(head.getAttribute('aria-expanded')).toBe('false');
    expect(host.textContent).not.toContain('session list');
    act(() => head.click());
    expect(button('Sessions').getAttribute('aria-expanded')).toBe('true');
    const body = document.getElementById(button('Sessions').getAttribute('aria-controls')!);
    expect(body?.textContent).toBe('session list');
    expect(button('New session')).toBeDefined();
  });
});

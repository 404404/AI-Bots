// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => {
  const stub = () => null;
  return {
    IconCodeOutlineRegular: () => null,
    IconBranchOutlineRegular: () => null,
    Button: stub,
    MenuItemButton: stub,
    IconAgentPresetOutlineRegular: stub,
    IconChevronDownOutlineRegular: stub,
    IconChevronRightOutlineRegular: stub,
    IconCloseOutlineRegular: stub,
    IconEditOutlineRegular: stub,
    IconEllipsisOutlineRegular: stub,
    IconNewChatOutlineRegular: stub,
    IconPanelLeftOutlineRegular: stub,
    IconTriangleRightFill14: stub,
    IconTrashOutlineRegular: stub,
    IconPlusOutlineRegular: stub,
    IconSearchOutlineRegular: stub,
    IconSendOutlineRegular: stub,
    Input: stub,
    Menu: stub,
    MarkdownText: stub,
    Modal: stub,
    StateDot: stub,
    Tag: stub,
    Tooltip: stub,
    relativeTime: () => ({ unit: 'now', n: 0 }),
  };
});

import { installStyles } from '../src/client/index.js';

function hostClaimsUntaggedStyles(moduleId: string): void {
  for (const el of document.querySelectorAll('style:not([data-plugin])'))
    el.setAttribute('data-plugin', moduleId);
}

function hostRemovesOwnedStyles(moduleId: string): void {
  for (const el of document.querySelectorAll('style[data-plugin]'))
    if (el.getAttribute('data-plugin') === moduleId) el.remove();
}

describe('client styles ownership', () => {
  afterEach(() => {
    document.head.innerHTML = '';
  });

  it('keeps the sheet when another plugin materializes and is later replaced', () => {
    const dispose = installStyles();
    hostClaimsUntaggedStyles('another-plugin');
    hostRemovesOwnedStyles('another-plugin');
    expect(document.querySelector('style[data-botharness="client"]')).not.toBeNull();
    dispose();
    expect(document.querySelector('style[data-botharness="client"]')).toBeNull();
  });
});

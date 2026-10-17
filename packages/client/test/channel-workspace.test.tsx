// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import { ChannelWorkspace } from '../src/client/channel-workspace.js';

describe('fixed Channel subpanel placement', () => {
  it.each(['left', 'right', 'above', 'below'] as const)(
    'keeps %s when the parent narrows',
    (direction) => {
      Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
      const callbacks: (() => void)[] = [];
      vi.stubGlobal(
        'ResizeObserver',
        class {
          constructor(notify: () => void) {
            callbacks.push(notify);
          }
          observe() {}
          disconnect() {}
        },
      );
      let width = 800;
      const bounds = vi
        .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
        .mockImplementation(() => new DOMRect(0, 0, width, 600));
      const host = document.createElement('div');
      document.body.append(host);
      const root = createRoot(host);
      try {
        act(() =>
          root.render(
            createElement(ChannelWorkspace, {
              channelId: 'dm-ada',
              state: { open: true, direction, ratio: 0.3, hiddenControl: false },
              setState: vi.fn(),
              content: 'Messages',
              sessions: 'Sessions',
              header: 'Sessions',
              label: 'Sessions',
            }),
          ),
        );
        for (const next of [800, 519, 320, 521, 800]) {
          width = next;
          act(() => callbacks.forEach((notify) => notify()));
          expect(
            host.querySelector('[data-workspace-split]')?.getAttribute('data-split-axis'),
          ).toBe(direction === 'left' || direction === 'right' ? 'horizontal' : 'vertical');
          expect(host.querySelector('[data-channel-subpanel]')?.getAttribute('style')).toContain(
            '30%',
          );
        }
      } finally {
        act(() => root.unmount());
        host.remove();
        bounds.mockRestore();
        vi.unstubAllGlobals();
      }
    },
  );
});

import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import type { ChannelActivity } from '../src/host/channel-activity';
import type { ConversationMessage } from '../src/host/conversation';
import { space, touch } from '../src/ui/design/tokens';

const { captureStyle } = vi.hoisted(() => ({ captureStyle: vi.fn() }));

vi.mock('react-native', async () => ({
  ...(await import('./react-native-shim')),
  Pressable: ({
    children,
    style,
  }: {
    children: ReactNode;
    style: (state: { pressed: boolean }) => object;
  }) => {
    captureStyle(style({ pressed: false }));
    return <div>{children}</div>;
  },
}));
vi.mock('expo-router', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('react-native-svg', () => ({ default: () => null, Path: () => null, SvgXml: () => null }));

const { ActivityRow } = await import('../src/ui/chat/activity-row');

const message: ConversationMessage = {
  id: 'notice',
  at: '2026-10-16T00:00:00Z',
  author: 'bot',
  bot: 'ada',
  body: '',
  attachments: [],
  delivery: 'committed',
};

describe('activity row spacing', () => {
  it.each<ChannelActivity>([
    { kind: 'bot-create', botSlug: 'bob', displayName: 'Bob' },
    { kind: 'channel-post', channelId: 'research', messageId: 'post', preview: 'Latest note.' },
  ])('separates $kind from bubbles while keeping its contents compact', (activity) => {
    renderToStaticMarkup(<ActivityRow message={message} activity={activity} roster={undefined} />);
    expect(captureStyle).toHaveBeenLastCalledWith(
      expect.objectContaining({
        paddingVertical: space.x3,
        paddingHorizontal: space.x6,
        gap: space.x1,
        minHeight: touch.ios,
      }),
    );
  });
});

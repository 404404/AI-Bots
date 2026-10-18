// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ClientError } from '../src/cloud/instance-contract';
const state = vi.hoisted(() => ({
  initialChannelId: 'channel_a' as string | undefined,
  messages: vi.fn(),
  read: vi.fn(),
  remove: vi.fn(),
  open: vi.fn(),
}));
vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
vi.mock('react-native', () => import('./react-native-shim'));
vi.mock('react-native-reanimated', () => import('./reanimated-shim'));
vi.mock('react-native-keyboard-controller', () => import('./keyboard-controller-shim'));
vi.mock('react-native-worklets', () => ({ scheduleOnRN: (fn: () => void) => fn() }));
vi.mock('react-native-svg', () => ({ default: () => null, Path: () => null }));
vi.mock('expo-router', async () => {
  const { useEffect } = await import('react');
  return {
    router: { push: vi.fn() },
    useFocusEffect: (callback: () => void) => useEffect(callback, [callback]),
    useLocalSearchParams: () => ({
      instanceId: 'uat',
      organizationId: 'org_a',
      channelId: state.initialChannelId,
    }),
  };
});
vi.mock('../src/host/native-source-drafts', async () => {
  const { useState } = await import('react');
  return { useSourceDraft: () => useState('') };
});
vi.mock('../src/cloud/workspace-directory', () => ({ cloudViewScope: () => 'account_a' }));
vi.mock('../src/cloud/native-message-cache', () => ({
  readCloudMessages: state.read,
  removeCloudMessages: state.remove,
  cacheCloudMessages: vi.fn(),
}));
vi.mock('../src/cloud/native', () => ({
  cloudClient: {
    openChannel: state.open,
    whoami: async () => {},
    listChannels: async () => ({
      channels: [{ channelId: 'channel_b', name: 'B' }],
      nextCursor: null,
    }),
    readMessages: state.messages,
  },
  useCloudSnapshot: () => ({
    ready: true,
    busy: false,
    rows: [
      {
        config: { instanceId: 'uat' },
        hasSession: true,
        sessionUserId: 'user_a',
        organization: { role: 'member', name: 'A' },
      },
    ],
  }),
}));
import { CloudChannelsScreen } from '../src/ui/cloud/channels-screen';
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const cached = {
  channel: { channelId: 'channel_a', name: 'Private channel' },
  messages: [{ sequence: 1, text: 'Cached private text', authorId: 'a', authorType: 'human' }],
  hasMore: false,
};
afterEach(() => {
  state.initialChannelId = 'channel_a';
});
describe('cloud channel cached access', () => {
  it.each(['CHANNEL_ACCESS_DENIED', 'NETWORK_UNAVAILABLE'])(
    'handles %s after cache has loaded',
    async (code) => {
      state.remove.mockReset();
      state.read.mockResolvedValue(cached);
      let reject: (error: Error) => void = () => {};
      state.open.mockImplementation(
        () =>
          new Promise((_resolve, fail) => {
            reject = fail;
          }),
      );
      const node = document.createElement('div');
      const root = createRoot(node);
      await act(async () => root.render(<CloudChannelsScreen />));
      expect(node.textContent).toContain('Cached private text');
      await act(async () => reject(new ClientError(code)));
      if (code === 'NETWORK_UNAVAILABLE') {
        expect(node.textContent).toContain('Cached private text');
        expect(state.remove).not.toHaveBeenCalled();
      } else {
        expect(node.textContent).not.toContain('Cached private text');
        expect(state.remove).toHaveBeenCalled();
      }
      act(() => root.unmount());
    },
  );
  it('invalidates the attempted list channel rather than the previous render selection', async () => {
    state.initialChannelId = undefined;
    state.remove.mockReset();
    state.messages.mockRejectedValue(new ClientError('CHANNEL_ACCESS_DENIED'));
    const node = document.createElement('div');
    const root = createRoot(node);
    await act(async () => root.render(<CloudChannelsScreen />));
    const button = [...node.querySelectorAll('button')].find((entry) =>
      entry.textContent?.endsWith(': B'),
    );
    expect(button).toBeDefined();
    await act(async () => button!.click());
    expect(state.remove).toHaveBeenCalledWith(
      JSON.stringify(['cloud', 'account_a', 'org_a', 'channel_b']),
    );
    act(() => root.unmount());
  });
  it('does not resurrect a delayed cache after permission denial', async () => {
    let release: (value: unknown) => void = () => {};
    state.read.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    state.open.mockRejectedValue(new ClientError('CHANNEL_ACCESS_DENIED'));
    const node = document.createElement('div');
    const root = createRoot(node);
    await act(async () => root.render(<CloudChannelsScreen />));
    await act(async () => release(cached));
    expect(node.textContent).not.toContain('Cached private text');
    act(() => root.unmount());
  });
});

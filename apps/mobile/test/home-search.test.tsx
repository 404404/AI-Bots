// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { CloudRow } from '../src/cloud/client';
import type { CloudConversation } from '../src/cloud/conversations';
import { publicInstance, MOBILE_REDIRECT_URI } from '../src/cloud/instance-contract';
import { cloudViewScope } from '../src/cloud/workspace-directory';
import type { RosterView } from '../src/host/client';

const { push, cloudState, directoryState } = vi.hoisted(() => ({
  push: vi.fn(),
  cloudState: { ready: true, busy: false, rows: [] as CloudRow[] },
  directoryState: { busy: false, rows: [] as CloudConversation[], errors: [] as string[] },
}));
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
    {
      slug: 'xiaoming',
      displayName: '小明',
      roles: [],
      computerAccess: false,
      browserAccess: false,
      state: 'idle',
      paused: false,
    },
  ],
  channels: [{ id: 'launch-team', name: 'Launch team', memberCount: 3, members: [] }],
};

vi.mock('../src/cloud/native', () => ({
  useCloudSnapshot: () => cloudState,
  cloudClient: { getSnapshot: () => cloudState },
}));
vi.mock('../src/cloud/native-conversations', () => ({
  useCloudConversations: () => directoryState,
  cloudConversations: { refresh: async () => {} },
}));
vi.mock('react-native-keyboard-controller', async () => import('./keyboard-controller-shim'));
vi.mock('react-native', () => import('./react-native-shim'));
vi.mock('react-native-reanimated', () => import('./reanimated-shim'));
vi.mock('react-native-worklets', () => ({ scheduleOnRN: (callback: () => void) => callback() }));
vi.mock('react-native-svg', () => ({ default: () => null, Path: () => null }));
vi.mock('expo-router', () => {
  const Stack = () => null;
  Stack.Screen = () => null;
  return {
    Redirect: () => null,
    Stack,
    router: { push },
    useIsFocused: () => true,
    useRouter: () => ({ push }),
  };
});
vi.mock('../src/host/host-session', () => ({
  useHostSession: () => ({
    saved: { hostId: 'h1', hostName: 'studio' },
    client: undefined,
    inbox: undefined,
  }),
  useHostSnapshot: () => ({ connection: { status: 'connected', route: '' }, roster }),
  useInbox: () => ({ status: 'loading' }),
}));
vi.mock('../src/host/native-section-collapse', () => ({
  sectionCollapse: { toggle: () => {} },
  useCollapsedSections: () => new Set(),
}));
vi.mock('../src/host/native-host-look', () => ({
  useHostLook: () => ({ avatar: { kind: 'initial' }, banner: { kind: 'accent' } }),
}));
vi.mock('../src/ui/chat/section-header', () => ({ SectionHeader: () => null }));
vi.mock('../src/ui/shell/home-header', () => ({
  HomeHeader: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('../src/ui/shell/host-drawer', () => ({
  HostDrawerEdge: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('../src/ui/shell/human-avatar', () => ({ HumanAvatarButton: () => null }));
vi.mock('../src/ui/connection-banner', () => ({ ConnectionBanner: () => null }));
vi.mock('../src/ui/bot-avatar', () => ({ BotAvatar: () => null }));

import HomeScreen from '../app/(tabs)/(home)/index';
import { t } from '../src/ui/strings';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let root: Root | undefined;
let host: HTMLElement | undefined;
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = undefined;
  push.mockReset();
  cloudState.rows = [];
  directoryState.rows = [];
});

async function home(): Promise<HTMLElement> {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(<HomeScreen />));
  return host;
}

async function type(view: HTMLElement, text: string): Promise<void> {
  const field = view.querySelector<HTMLTextAreaElement>(
    `textarea[aria-label="${t.searchPlaceholder}"]`,
  )!;
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(field), 'value')!.set!;
  await act(async () => {
    setter.call(field, text);
    field.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

const rows = (view: HTMLElement) =>
  [...view.querySelectorAll('button')]
    .filter(
      (node) =>
        ![t.cloudJoin.newOrJoin, t.allConversations, 'studio'].includes(
          node.getAttribute('aria-label') ?? '',
        ),
    )
    .map((node) => node.getAttribute('aria-label'));

describe('Search at the top of Chats', () => {
  it('opens a cloud row with its account and organization while leaving the paired Computer selected', async () => {
    const config = publicInstance({
      instanceId: 'uat',
      environment: 'uat',
      server: 'https://uat.example.test',
      clientId: 'client_test',
      issuer: 'https://api.workos.com/user_management/client_test',
      authkitDomain: 'test-staging.authkit.app',
      mobileRedirectUri: MOBILE_REDIRECT_URI,
    });
    const cloudRow: CloudRow = {
      config,
      hasSession: true,
      sessionUserId: 'user_a',
      identity: { instanceId: 'uat', userId: 'user_a', instanceRole: 'user' },
      organization: {
        organizationId: 'org_a',
        name: 'Cloud team',
        description: '',
        version: 1,
        role: 'member',
      },
    };
    const scope = cloudViewScope(cloudRow);
    cloudState.rows = [cloudRow];
    directoryState.rows = [
      {
        key: 'cloud-one',
        scope,
        instanceId: 'uat',
        organizationId: 'org_a',
        organizationName: 'Cloud team',
        guest: false,
        channel: {
          channelId: 'ch_' + 'a'.repeat(64),
          name: 'Cloud general',
          creatorId: 'user_a',
          creatorType: 'human',
          createdAt: '2026-10-18T00:00:00Z',
        },
      },
    ];
    const view = await home();
    expect(view.textContent).toContain('Cloud general');
    expect(view.textContent).toContain('Ada');
    await act(async () =>
      view
        .querySelector<HTMLButtonElement>(
          `button[aria-label="Cloud general, ${t.cloudChannels.cloudChannel}"]`,
        )!
        .click(),
    );
    expect(push).toHaveBeenLastCalledWith({
      pathname: '/cloud-channels',
      params: {
        instanceId: 'uat',
        organizationId: 'org_a',
        channelId: 'ch_' + 'a'.repeat(64),
        guest: 'false',
        accountScope: scope,
      },
    });
    await act(async () =>
      view.querySelector<HTMLButtonElement>('button[aria-label="studio"]')!.click(),
    );
    expect(view.textContent).not.toContain('Cloud general');
    expect(view.textContent).toContain('Ada');
  });

  it('filters the list in place and opens the chat the Human taps', async () => {
    const view = await home();
    expect(rows(view)).toHaveLength(3);

    await type(view, 'AD');
    expect(rows(view)).toEqual(['Ada, Done']);
    await act(async () =>
      view.querySelector<HTMLButtonElement>('button[aria-label="Ada, Done"]')!.click(),
    );
    expect(push).toHaveBeenLastCalledWith({
      pathname: '/dm/[slug]',
      params: { slug: 'ada', hostId: 'h1' },
    });

    await type(view, '小明');
    expect(rows(view)).toEqual(['小明']);

    await type(view, 'launch');
    await act(async () =>
      [...view.querySelectorAll('button')]
        .find((node) => node.getAttribute('aria-label')?.startsWith('Launch team'))!
        .click(),
    );
    expect(push).toHaveBeenLastCalledWith({
      pathname: '/channel/[id]',
      params: { id: 'launch-team', hostId: 'h1' },
    });
  });

  it('says plainly when nothing matches', async () => {
    const view = await home();
    await type(view, ' zed ');
    expect(rows(view)).toEqual([]);
    expect(view.textContent).toContain(t.searchNoMatch('zed'));
  });
});

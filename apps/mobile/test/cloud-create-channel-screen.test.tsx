// @vitest-environment jsdom
import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import type { CloudSnapshot } from '../src/cloud/client';
import { publicInstance, MOBILE_REDIRECT_URI } from '../src/cloud/instance-contract';
import { cloudViewScope } from '../src/cloud/workspace-directory';
const mocks = vi.hoisted(() => ({
  snapshot: undefined as CloudSnapshot | undefined,
  scope: '',
  prepare: vi.fn(),
  create: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock('react-native', () => import('./react-native-shim'));
vi.mock('react-native-svg', () => ({ default: () => null, Path: () => null, Rect: () => null }));
vi.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  router: { replace: mocks.replace },
  useLocalSearchParams: () => ({
    instanceId: 'uat',
    organizationId: 'org_a',
    accountScope: mocks.scope,
  }),
}));
vi.mock('../src/cloud/native', () => ({
  useCloudSnapshot: () => mocks.snapshot,
  cloudClient: { createChannel: mocks.create, getSnapshot: () => mocks.snapshot },
}));
vi.mock('../src/cloud/native-conversations', () => ({
  cloudConversations: { refresh: mocks.refresh },
}));
vi.mock('../src/cloud/prepare-creation', () => ({ prepareCloudCreation: mocks.prepare }));
vi.mock('../src/ui/primitives/keyboard-form', () => ({
  KeyboardFormScroll: ({ children }: { children: ReactNode }) =>
    createElement('div', null, children),
}));
import { CloudCreateChannelScreen } from '../src/ui/cloud/create-channel-screen';
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root;
let host: HTMLElement;
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  vi.clearAllMocks();
});
async function render() {
  mocks.snapshot = {
    ready: true,
    busy: false,
    rows: [
      {
        config: publicInstance({
          instanceId: 'uat',
          environment: 'uat',
          server: 'https://uat.example.test',
          clientId: 'client_test',
          issuer: 'https://api.workos.com/user_management/client_test',
          authkitDomain: 'test-staging.authkit.app',
          mobileRedirectUri: MOBILE_REDIRECT_URI,
        }),
        hasSession: true,
        sessionUserId: 'user_a',
        organization: {
          organizationId: 'org_a',
          name: 'Workspace A',
          role: 'owner',
          description: '',
          version: 1,
        },
        pendingChannelAction: {
          kind: 'channel.create',
          organizationId: 'org_a',
          value: 'Keep my draft',
          operation: 'request_a',
          userId: 'user_a',
        },
      },
    ],
  };
  mocks.scope = cloudViewScope(mocks.snapshot.rows[0]);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(<CloudCreateChannelScreen />));
}
it('keeps the same draft input mounted while owner refresh clears the selected organization', async () => {
  await render();
  const input = host.querySelector('textarea');
  expect(input).not.toBeNull();
  delete mocks.snapshot!.rows[0]!.organization;
  await act(async () => root.render(<CloudCreateChannelScreen />));
  expect(host.querySelector('textarea')).toBe(input);
  expect(host.textContent).toContain('Workspace A');
  expect(input?.value).toBe('Keep my draft');
});
it('removes the old account form instead of carrying its draft into a replacement login', async () => {
  await render();
  mocks.snapshot!.rows[0]!.sessionUserId = 'user_b';
  await act(async () => root.render(<CloudCreateChannelScreen />));
  expect(host.querySelector('textarea')).toBeNull();
  expect(mocks.create).not.toHaveBeenCalled();
});

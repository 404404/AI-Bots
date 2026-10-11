// @vitest-environment jsdom
import { act, createElement, type ReactNode, type InputHTMLAttributes } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import {
  GroupComposerContextView,
  useGroupComposerContext,
} from '../src/client/group-composer-context.js';
import { BridgeCallError, type WorkspaceGrantView } from '../src/client/bridge.js';
import type { BridgeActions } from '../src/client/actions.js';
import type { BotSummary } from '../src/client/store.js';
import { zhTranslate } from '../src/client/locale.js';
import type { ComposerContext } from '../src/client/composer-shortcuts.js';

vi.mock('../src/client/modal.js', () => ({
  Modal: ({ children, title }: { children: ReactNode; title: string }) =>
    createElement('section', { role: 'dialog', 'aria-label': title }, children),
}));
vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  Button: ({ children, ...props }: { children: ReactNode }) =>
    createElement('button', props, children),
  Input: (props: InputHTMLAttributes<HTMLInputElement>) => createElement('input', props),
  IconChevronDownOutlineRegular: () => null,
  IconCloseOutlineRegular: () => null,
  IconFolderOpenOutlineRegular: () => null,
}));

const ada: BotSummary = {
  slug: 'ada',
  displayName: 'Ada',
  roles: [],
  aggregateState: 'idle',
  workspaces: [],
  createdAt: '',
};
const bea: BotSummary = { ...ada, slug: 'bea', displayName: 'Bea' };
const bob: BotSummary = { ...ada, slug: 'bob', displayName: 'Bob' };
const grant: WorkspaceGrantView = {
  id: 'grant',
  botSlug: 'ada',
  workspaceId: 'project',
  workspacePath: '/project',
  workspaceTitle: 'Project',
  createdAt: '',
  path: '/project',
  title: 'Project',
  orchestratorWrite: false,
};

it('requires explicit members, shares folder confirmation, isolates partial results and preserves them when membership changes', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  let committed = false;
  const actions = {
    listWorkspaceGrants: vi.fn(async (slug: string) =>
      committed && slug === 'ada' ? [grant] : [],
    ),
    listWorkspaceOptions: vi.fn(async () => [
      { id: 'project', path: '/project', title: 'Project' },
    ]),
    listHostFolders: vi.fn(async () => ({
      path: '/project',
      entries: [],
      crumbs: [],
      truncated: false,
    })),
    resolveWorkspaceFolder: vi.fn(async () => ({
      id: 'project',
      path: '/project',
      title: 'Project',
    })),
    assignmentAccess: vi.fn(async (botSlug: string) => ({
      botSlug,
      mode: 'workspace-write',
      revision: 0,
    })),
    readGroupWorkspaceGrant: vi.fn(async (_channel: string, slug: string) =>
      committed && slug === 'ada' ? grant : undefined,
    ),
    authorizeGroupWorkspacePath: vi.fn(async (_channel: string, slug: string) => {
      if (slug === 'bea') throw new BridgeCallError('invalid-grant', 'Member departed');
      committed = true;
      return { grant, created: true };
    }),
    send: vi.fn(),
    setAssignmentAccess: vi.fn(),
    setWorkspaceGrantWrite: vi.fn(),
  } as unknown as BridgeActions;
  const render = (members: BotSummary[]) =>
    root.render(
      createElement(GroupComposerContextView, {
        channelId: 'group',
        members,
        actions,
        t: zhTranslate,
        open: true,
        onOpen() {},
        onClose() {},
      }),
    );
  const button = (text: string) =>
    Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find(
      (item) => item.textContent === text && !item.disabled,
    )!;
  try {
    await act(async () => render([ada, bea, bob]));
    expect(
      Array.from(container.querySelectorAll<HTMLInputElement>('input[type=checkbox]')).every(
        (input) => !input.checked,
      ),
    ).toBe(true);
    expect(
      Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find(
        (item) => item.textContent === zhTranslate('grant.addFolder'),
      )!.disabled,
    ).toBe(true);
    await act(async () => {
      container.querySelectorAll<HTMLInputElement>('input[type=checkbox]')[0]!.click();
      container.querySelectorAll<HTMLInputElement>('input[type=checkbox]')[1]!.click();
    });
    await act(async () =>
      container.querySelector<HTMLButtonElement>('.bh-workspace-folder-toggle')!.click(),
    );
    await act(async () => button(zhTranslate('grant.authorize')).click());
    expect(container.textContent).toContain(zhTranslate('groupGrant.confirm'));
    expect(container.textContent).toContain('/project');
    expect(container.querySelector('.bh-group-grant-members')).toBeNull();
    expect(container.querySelector('.bh-group-grant-directory')!.textContent).toBe('/project');
    expect(container.querySelectorAll('.bh-group-grant-result')).toHaveLength(2);
    expect(container.querySelector('.bh-group-grant-policy')!.hasAttribute('open')).toBe(false);
    expect(container.textContent).toContain(zhTranslate('groupGrant.unselected'));
    expect(actions.authorizeGroupWorkspacePath).not.toHaveBeenCalled();
    await act(async () => button(zhTranslate('grant.authorize')).click());
    expect(container.textContent).toContain(zhTranslate('groupGrant.created'));
    expect(container.textContent).toContain(zhTranslate('groupGrant.failed'));
    expect(actions.authorizeGroupWorkspacePath).toHaveBeenCalledTimes(2);
    await act(async () => render([ada, bob]));
    expect(container.textContent).toContain(zhTranslate('groupGrant.created'));
    await act(async () => button(zhTranslate('groupGrant.retry')).click());
    expect(actions.authorizeGroupWorkspacePath).toHaveBeenCalledTimes(3);
    expect(
      vi.mocked(actions.authorizeGroupWorkspacePath).mock.calls.map((call) => call[1]),
    ).toEqual(['ada', 'bea', 'bea']);
    expect(
      vi.mocked(actions.listWorkspaceGrants).mock.calls.every((call) => call[0] !== 'bob'),
    ).toBe(true);
    expect(actions.send).not.toHaveBeenCalled();
    expect(actions.setAssignmentAccess).not.toHaveBeenCalled();
    expect(actions.setWorkspaceGrantWrite).not.toHaveBeenCalled();
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});

it('offers only the shared workspace shortcut in Group and resets scope on Channel switches', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const container = document.createElement('div');
  const root = createRoot(container);
  let id = 'one';
  let context: ComposerContext | undefined;
  function Harness() {
    context = useGroupComposerContext({
      channel: { id, name: id, type: 'group', members: ['ada'], createdAt: '', updatedAt: '' },
      members: [ada],
      actions: {} as BridgeActions,
      t: zhTranslate,
    });
    return context?.content;
  }
  try {
    await act(async () => root.render(createElement(Harness)));
    expect(context!.shortcuts.map((item) => item.id)).toEqual(['workspace']);
    await act(async () => context!.shortcuts[0]!.run());
    expect(container.querySelector('[role=dialog]')).not.toBeNull();
    id = 'two';
    await act(async () => root.render(createElement(Harness)));
    expect(container.querySelector('[role=dialog]')).toBeNull();
    expect(context!.target).toBe('two');
  } finally {
    await act(async () => root.unmount());
  }
});

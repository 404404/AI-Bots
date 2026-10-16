// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  BotSessionFolders,
  mountBotFolderProjection,
  mountNativeBotFolderHost,
  type BotSessionFoldersProps,
} from '../src/client/bot-session-folders.js';
import { zhTranslate } from '../src/client/locale.js';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
function stub<T>(value: Partial<T>): T {
  return value as T;
}
afterEach(() => document.body.replaceChildren());

function nativeTree() {
  const tree = document.createElement('div');
  tree.setAttribute('role', 'tree');
  for (const id of ['orchestrator', 'assignment', 'ordinary']) {
    const row = document.createElement('div');
    row.dataset['rowKey'] = `session:${id}`;
    row.textContent = id;
    tree.append(row);
  }
  document.body.append(tree);
  return tree;
}

describe('native Bot Session folders', () => {
  it('groups the same Bot across cwd, opens the exact Session, and persists collapse', async () => {
    const tree = nativeTree();
    const originalRow = tree.querySelector('[data-row-key="session:assignment"]');
    const rootNode = document.createElement('div');
    document.body.append(rootNode);
    const root = createRoot(rootNode);
    const openSession = vi.fn();
    const values = new Map<string, string>();
    const list = {
      ids: ['orchestrator', 'assignment', 'ordinary'],
      byId: {
        orchestrator: {
          displayTitle: 'Coordinate',
          cwd: '/memory/ada',
          retainedBy: {},
          running: false,
        },
        assignment: { displayTitle: 'Build', cwd: '/project', retainedBy: {}, running: true },
        ordinary: { displayTitle: 'Ordinary', cwd: '/project', retainedBy: {} },
      },
    };
    const groups = [
      { botSlug: 'ada', displayName: 'Ada', sessionIds: ['orchestrator', 'assignment', 'missing'] },
    ];
    const source = <T,>(value: T) => ({ getSnapshot: () => value, subscribe: () => () => {} });
    let folderHost: HTMLElement | null = null;
    const projection = mountBotFolderProjection({
      sessions: source(list),
      groups: source(groups),
      workspaces: source({ items: [], archivedSessionIds: [] }),
      prefs: source({ showBotSessions: true, showApprovalReviewSessions: false }),
      setHost: (host) => {
        folderHost = host;
      },
    });
    const props = stub<BotSessionFoldersProps>({
      useBotFolderGroups: (select) =>
        select([
          {
            botSlug: 'ada',
            displayName: 'Ada',
            sessionIds: ['orchestrator', 'assignment', 'missing'],
          },
        ]),
      useBotFolderPrefs: (select) => select({ showBotSessions: true }),
      useBotFolderHost: (select) => select(folderHost),
      setMounted: (node) => projection.setMounted(node),
      useSessions: (select) => select(list as never),
      useWorkspaces: (select) => select({ items: [], archivedSessionIds: [] } as never),
      storage: {
        getItem: (key) => values.get(key) ?? null,
        setItem: (key, value) => {
          values.set(key, value);
        },
      },
      openSession,
      t: zhTranslate,
    });
    try {
      await act(async () => root.render(createElement(BotSessionFolders, props)));
      expect(tree.querySelectorAll('[data-bot-folder]')).toHaveLength(1);
      expect(tree.querySelectorAll('[data-bot-folder-session]')).toHaveLength(2);
      expect(tree.querySelector('[data-row-key="session:assignment"]')).toBe(originalRow);
      expect(list.byId.assignment.cwd).toBe('/project');
      await act(async () =>
        tree.querySelector<HTMLButtonElement>('[data-bot-folder-session="assignment"]')!.click(),
      );
      expect(openSession).toHaveBeenCalledExactlyOnceWith('assignment');
      await act(async () =>
        tree.querySelector<HTMLButtonElement>('[data-bot-folder="ada"] > button')!.click(),
      );
      expect(tree.querySelectorAll('[data-bot-folder-session]')).toHaveLength(0);
      await act(async () => root.render(null));
      await act(async () => root.render(createElement(BotSessionFolders, props)));
      expect(tree.querySelector('[data-bot-folder="ada"]')?.getAttribute('aria-expanded')).toBe(
        'false',
      );
      expect(tree.querySelectorAll('[data-bot-folder-session]')).toHaveLength(0);
    } finally {
      await act(async () => root.unmount());
      projection.dispose();
    }
    expect(tree.querySelector('[data-row-key="session:assignment"]')).toBe(originalRow);
    expect(document.querySelector('[data-plugin-css="bot-session-folders"]')).toBeNull();
    expect(tree.hasAttribute('data-botharness-folder-tree')).toBe(false);
  });

  it('fails open on unsupported markup and releases the host when native trees change', async () => {
    const changed = vi.fn();
    const dispose = mountNativeBotFolderHost(document, changed);
    expect(document.querySelector('[data-botharness-bot-folders]')).toBeNull();
    const first = nativeTree();
    await vi.waitFor(() =>
      expect(first.querySelector('[data-botharness-bot-folders]')).not.toBeNull(),
    );
    first.remove();
    const second = nativeTree();
    await vi.waitFor(() =>
      expect(second.querySelector('[data-botharness-bot-folders]')).not.toBeNull(),
    );
    expect(first.querySelector('[data-botharness-bot-folders]')).toBeNull();
    dispose();
    expect(second.querySelector('[data-botharness-bot-folders]')).toBeNull();
    nativeTree();
    await Promise.resolve();
    expect(document.querySelector('[data-botharness-bot-folders]')).toBeNull();
  });
});

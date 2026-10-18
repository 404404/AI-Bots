// @vitest-environment jsdom
import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  IconChevronDownOutlineRegular: () => null,
  Modal: () => null,
  MarkdownText: () => null,
  Tooltip: ({ children }: { children: ReactNode }) => children,
  Menu: () => null,
}));
vi.mock('../src/client/bot-sidebar.js', () => ({
  BotSidebar: () => null,
  useClientState: () => ({}),
}));
vi.mock('../src/client/home-panel.js', () => ({ HomePanel: () => null }));

import { apply as applyBrowser } from '../../browser/src/client/index.js';
import { apply as applyComputer } from '../../computer/src/client/index.js';
import { ChannelDock } from '../src/client/channel-dock.js';
import {
  CHANNEL_BODY_PANEL,
  CHANNEL_DOCK_QUERY,
  CHANNEL_WORKSPACE_PANELS,
  readChannelDock,
} from '../src/client/channel-dock-layout.js';
import {
  createChannelSidebarRegistry,
  type ChannelSidebarEntryProps,
} from '../src/client/channel-sidebar.js';
import {
  createChannelSidebarBuiltins,
  createChannelSidebarBuiltinTabs,
} from '../src/client/channel-sidebar-builtins.js';
import { createActivityCenterPanel } from '../src/client/activity-center-panel.js';
import { createDockPanelRegistry, type DockPanelRegistration } from '../src/client/dock-panels.js';
import { zhTranslate } from '../src/client/locale.js';
import { Workspace } from '../src/client/workspace.js';
import { WorkspaceContext, WORKSPACE_HOME } from '../src/client/workspace-context.js';

let host: HTMLDivElement;
let root: Root;
const values = new Map<string, string>();
const storage = {
  getItem: (key: string) => values.get(key) ?? null,
  setItem: (key: string, value: string) => void values.set(key, value),
  removeItem: (key: string) => void values.delete(key),
};

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query === CHANNEL_DOCK_QUERY,
    addEventListener() {},
    removeEventListener() {},
  }));
  values.clear();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function productionPanels(): Promise<readonly DockPanelRegistration[]> {
  const registry = createDockPanelRegistry();
  const sidebar = createChannelSidebarRegistry(registry);
  for (const tab of createChannelSidebarBuiltinTabs(zhTranslate)) sidebar.registerTab(tab);
  for (const entry of createChannelSidebarBuiltins(zhTranslate)) sidebar.register(entry);
  registry.register(createActivityCenterPanel({} as never, zhTranslate));
  const disposers: (() => void)[] = [];
  const context = {
    locale: { bind: () => (key: string) => key, register: () => () => {} },
    effect: (factory: () => () => void) => {
      disposers.push(factory());
    },
    inject: (deps: readonly string[], callback: (context: unknown) => void) => {
      if (deps.includes('channelSidebar')) callback({ channelSidebar: sidebar });
    },
  };
  applyBrowser(context as never);
  applyComputer(context as never);
  const frame = document.createElement('div');
  frame.style.display = 'grid';
  frame.innerHTML =
    '<div><div data-slot="sidebar"></div></div><div><div data-slot="main"></div></div><div data-rightbar-col></div><div data-shell-overlay></div>';
  document.body.append(frame);
  const mount = createRoot(frame.querySelector('[data-slot="main"]')!);
  try {
    act(() =>
      mount.render(
        createElement(Workspace, {
          t: zhTranslate,
          children: null,
          options: { dockPanels: registry, layout: { toggleSidebar() {} } } as never,
        }),
      ),
    );
    await settle();
    expect(frame.querySelector('[data-workspace-enabled]')).not.toBeNull();
    return registry.panels().map((panel) => {
      const entry = panel.entry
        ? {
            ...panel.entry,
            component: () => createElement('input', { 'data-contract-content': panel.id }),
          }
        : undefined;
      if (entry) {
        delete entry.headerAction;
        delete entry.headerTabs;
        delete entry.badge;
      }
      return {
        ...panel,
        entry,
        component: () => createElement('input', { 'data-contract-content': panel.id }),
        headerAction: () => createElement('button', { 'data-contract-action': panel.id }, 'Action'),
      };
    });
  } finally {
    act(() => mount.unmount());
    frame.remove();
    for (const dispose of disposers.reverse()) dispose();
  }
}

it('every production global registration preserves nested geometry and surviving content when toggled', async () => {
  const panels = (await productionPanels()).filter((panel) => panel.scope === 'global');
  const registry = createDockPanelRegistry();
  for (const panel of panels) registry.register(panel);
  let api: import('dockview-react').DockviewApi | undefined;
  act(() =>
    root.render(
      createElement(
        WorkspaceContext.Provider,
        {
          value: {
            rail: (dock) => {
              api = dock;
              return createElement('nav');
            },
          },
        },
        createElement(ChannelDock, {
          body: createElement('input', { 'data-contract-content': CHANNEL_BODY_PANEL }),
          panels: registry.panels(),
          registry,
          entryProps: undefined,
          shows: () => true,
          t: zhTranslate,
          storage,
        }),
      ),
    ),
  );
  await settle();
  act(() => {
    api!.layout(1600, 900);
    for (const panel of panels) registry.open(panel.id);
    api!.getPanel(CHANNEL_BODY_PANEL)!.api.moveTo({ position: 'right' });
    const nested = panels.find(
      (panel) => ![CHANNEL_BODY_PANEL, WORKSPACE_HOME].includes(panel.id),
    )!;
    api!
      .getPanel(nested.id)!
      .api.moveTo({ group: api!.getPanel(CHANNEL_BODY_PANEL)!.group, position: 'bottom' });
  });
  await settle();
  const grid = () =>
    JSON.parse(
      JSON.stringify(api!.toJSON().grid, (_key, value) =>
        typeof value === 'number' ? Math.round(value * 1e6) / 1e6 : value,
      ),
    );
  const before = grid();
  for (const panel of registry.panels()) {
    const survivors = api!.panels
      .filter((current) => current.id !== panel.id)
      .map((current) => ({
        current,
        content: host.querySelector(`[data-contract-content="${current.id}"]`),
      }));
    const header = host.querySelector(`[data-dock-header="${panel.id}"]`)!;
    expect(header.querySelector('[data-panel-hide]'), panel.id).not.toBeNull();
    const action = header.querySelector<HTMLButtonElement>('[data-contract-action]');
    expect(action, panel.id).not.toBeNull();
    act(() => action!.click());
    expect(registry.isOpen(panel.id), panel.id).toBe(true);
    act(() => (header.querySelector('[data-panel-hide]') as HTMLButtonElement).click());
    await settle();
    expect(registry.isOpen(panel.id), panel.id).toBe(false);
    act(() => registry.open(panel.id));
    await settle();
    expect(grid(), panel.id).toEqual(before);
    for (const { current, content } of survivors) {
      expect(api!.getPanel(current.id), `${panel.id}: ${current.id}`).toBe(current);
      if (content)
        expect(host.querySelector(`[data-contract-content="${current.id}"]`)).toBe(content);
    }
  }
});

it('every fixed channel subpanel registration uses shared visibility and preserves the saved split tree', async () => {
  const panels = await productionPanels();
  const byId = new Map(panels.map((panel) => [panel.id, panel]));
  const registry = createDockPanelRegistry();
  for (const panel of panels) registry.register(panel);
  const channel = { id: 'dm-ada', type: 'dm' as const, botSlug: 'ada' };
  const entryProps = {
    scope: 'personabot',
    channelId: channel.id,
    botSlug: 'ada',
    actions: {},
    t: zhTranslate,
  } as unknown as ChannelSidebarEntryProps;
  act(() =>
    root.render(
      createElement(
        WorkspaceContext.Provider,
        { value: { rail: () => createElement('nav') } },
        createElement(ChannelDock, {
          body: createElement('input', { 'data-message-contract': '' }),
          panels: registry.panels(),
          registry,
          channel,
          entryProps,
          shows: () => true,
          t: zhTranslate,
          storage,
        }),
      ),
    ),
  );
  await settle();
  act(() => {
    registry.open(CHANNEL_BODY_PANEL);
    for (const id of CHANNEL_WORKSPACE_PANELS) {
      expect(byId.has(id), id).toBe(true);
      registry.open(id);
    }
  });
  await settle();
  act(() => {
    registry.editLayout(
      {
        type: 'move',
        panel: CHANNEL_WORKSPACE_PANELS.at(-1)!,
        target: CHANNEL_WORKSPACE_PANELS[0]!,
        direction: 'below',
        channelId: channel.id,
      },
      JSON.stringify(registry.readLayout()),
    );
    registry.editLayout(
      { type: 'child-resize', channelId: channel.id, path: '', ratio: 0.61 },
      JSON.stringify(registry.readLayout()),
    );
  });
  await settle();
  expect(readChannelDock(storage)?.channelSplits?.[channel.id]).toMatchObject({ ratio: 0.61 });
  const draft = host.querySelector('[data-message-contract]');
  for (const id of CHANNEL_WORKSPACE_PANELS) {
    const before = readChannelDock(storage)?.channelSplits;
    const survivors = CHANNEL_WORKSPACE_PANELS.filter((other) => other !== id).map((other) => ({
      other,
      content: host.querySelector(`[data-contract-content="${other}"]`),
    }));
    const head = host.querySelector<HTMLButtonElement>(
      `[data-dock-header="${id}"] [data-panel-hide]`,
    );
    expect(head, id).not.toBeNull();
    act(() => head!.click());
    await settle();
    expect(registry.isOpen(id), id).toBe(false);
    act(() => registry.open(id));
    await settle();
    expect(registry.isOpen(id), id).toBe(true);
    expect(readChannelDock(storage)?.channelSplits, id).toEqual(before);
    expect(host.querySelector('[data-message-contract]')).toBe(draft);
    for (const { other, content } of survivors)
      expect(host.querySelector(`[data-contract-content="${other}"]`), `${id}: ${other}`).toBe(
        content,
      );
  }
});

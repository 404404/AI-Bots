import type {
  AddPanelPositionOptions,
  DockviewApi,
  SerializedDockview,
  SerializedGridObject,
} from 'dockview-react';

import type { DockPanelPosition } from './dock-panels.js';

export const CHANNEL_DOCK_STORAGE_KEY = 'botharness.bot-mode-layout';
export const CHANNEL_DOCK_LAYOUT_VERSION = 4;
export const DEFAULT_WORKSPACE_GAP = 4;
export const CHANNEL_BODY_PANEL = 'bh:channel-body';
export const CHANNEL_DOCK_QUERY = '(min-width: 961px)';
export const CHANNEL_BODY_COMPONENT = 'channel-body';
export const CHANNEL_ENTRY_COMPONENT = 'channel-entry';
export const DEFAULT_DOCK_PANELS = ['sessions'] as const;

export type DockDirection = 'left' | 'right' | 'above' | 'below';

export interface DockPosition {
  readonly neighbor?: string | undefined;
  readonly direction: DockDirection;
}

export interface ChannelWorkspaceState {
  readonly open: boolean;
  readonly direction: DockDirection;
  readonly ratio: number;
  readonly hiddenControl: boolean;
}

export const DEFAULT_CHANNEL_WORKSPACE: ChannelWorkspaceState = {
  open: true,
  direction: 'right',
  ratio: 0.3,
  hiddenControl: false,
};

export interface StoredChannelDock {
  readonly version: typeof CHANNEL_DOCK_LAYOUT_VERSION;
  readonly gap?: number | undefined;
  readonly order?: readonly string[] | undefined;
  readonly hiddenControls?: readonly string[] | undefined;
  readonly members?: { open: boolean; ratio: number } | undefined;
  readonly sessionSeed?: ChannelWorkspaceState | undefined;
  readonly channelWorkspaces?: Readonly<Record<string, ChannelWorkspaceState>> | undefined;
  readonly layout: SerializedDockview;
  readonly parked: Readonly<Record<string, DockPosition>>;
}

export interface ChannelDockStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function browserStorage(): ChannelDockStorage | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isLayout(value: unknown): value is SerializedDockview {
  if (!isRecord(value) || !isRecord(value['panels']) || !isRecord(value['grid'])) return false;
  const root = value['grid']['root'];
  return isRecord(root) && root['type'] === 'branch' && Array.isArray(root['data']);
}

function isPosition(value: unknown): value is DockPosition {
  return (
    isRecord(value) &&
    (value['neighbor'] === undefined || typeof value['neighbor'] === 'string') &&
    ['left', 'right', 'above', 'below'].includes(value['direction'] as string)
  );
}

export function readChannelDock(
  storage: ChannelDockStorage | undefined = browserStorage(),
): StoredChannelDock | undefined {
  try {
    const raw = storage?.getItem(CHANNEL_DOCK_STORAGE_KEY);
    if (raw === null || raw === undefined) return undefined;
    const value: unknown = JSON.parse(raw);
    if (
      !isRecord(value) ||
      ![1, 2, 3, CHANNEL_DOCK_LAYOUT_VERSION].includes(value['version'] as number)
    )
      return undefined;
    if (!isLayout(value['layout'])) return undefined;
    const parked = isRecord(value['parked'])
      ? Object.fromEntries(Object.entries(value['parked']).filter(([, entry]) => isPosition(entry)))
      : {};
    const restored: StoredChannelDock = {
      version: CHANNEL_DOCK_LAYOUT_VERSION,
      gap:
        typeof value['gap'] === 'number' && Number.isFinite(value['gap'])
          ? Math.min(16, Math.max(0, Math.round(value['gap'])))
          : DEFAULT_WORKSPACE_GAP,
      order: Array.isArray(value['order'])
        ? [...new Set(value['order'].filter((id): id is string => typeof id === 'string'))]
        : [],
      hiddenControls: Array.isArray(value['hiddenControls'])
        ? [...new Set(value['hiddenControls'].filter((id): id is string => typeof id === 'string'))]
        : [],
      members: isRecord(value['members'])
        ? {
            open: value['members']['open'] === true,
            ratio:
              typeof value['members']['ratio'] === 'number' &&
              Number.isFinite(value['members']['ratio'])
                ? Math.min(0.6, Math.max(0.2, value['members']['ratio']))
                : 0.3,
          }
        : { open: false, ratio: 0.3 },
      sessionSeed: parseChannelWorkspace(value['sessionSeed']),
      channelWorkspaces: isRecord(value['channelWorkspaces'])
        ? Object.fromEntries(
            Object.entries(value['channelWorkspaces']).flatMap(([id, state]) => {
              const parsed = parseChannelWorkspace(state);
              return parsed ? [[id, parsed]] : [];
            }),
          )
        : {},
      layout: value['layout'],
      parked: parked as Record<string, DockPosition>,
    };
    const normalized = migrateWorkPanel(restored);
    const migrated =
      value['version'] === CHANNEL_DOCK_LAYOUT_VERSION
        ? normalized
        : migrateSessionsWorkspace(normalized);
    if (value['version'] !== CHANNEL_DOCK_LAYOUT_VERSION) {
      try {
        const backupKey = `${CHANNEL_DOCK_STORAGE_KEY}.before-channel-workspace-v4`;
        if (
          value['version'] !== 3 &&
          storage?.getItem(`${CHANNEL_DOCK_STORAGE_KEY}.before-sessions-v3`) == null
        )
          storage?.setItem(`${CHANNEL_DOCK_STORAGE_KEY}.before-sessions-v3`, raw);
        if (storage?.getItem(backupKey) == null) storage?.setItem(backupKey, raw);
        storage?.setItem(CHANNEL_DOCK_STORAGE_KEY, JSON.stringify(migrated));
      } catch {}
    }
    return migrated;
  } catch {
    return undefined;
  }
}

export function writeChannelDock(
  value: Omit<StoredChannelDock, 'version'>,
  storage: ChannelDockStorage | undefined = browserStorage(),
): void {
  try {
    const raw = storage?.getItem(CHANNEL_DOCK_STORAGE_KEY);
    if (raw) {
      let previous: unknown;
      try {
        previous = JSON.parse(raw);
      } catch {}
      if (!isRecord(previous) || previous['version'] !== CHANNEL_DOCK_LAYOUT_VERSION) {
        const backupKey = `${CHANNEL_DOCK_STORAGE_KEY}.before-channel-workspace-v4`;
        if (storage?.getItem(backupKey) == null) storage?.setItem(backupKey, raw);
      }
    }
    storage?.setItem(
      CHANNEL_DOCK_STORAGE_KEY,
      JSON.stringify({ version: CHANNEL_DOCK_LAYOUT_VERSION, ...value }),
    );
  } catch {}
}

export function clearChannelDock(storage: ChannelDockStorage | undefined = browserStorage()): void {
  try {
    storage?.removeItem(CHANNEL_DOCK_STORAGE_KEY);
  } catch {}
}

type GridNode = SerializedGridObject<{ views: string[]; activeView?: string; id: string }>;

function firstPanel(node: GridNode): string | undefined {
  if (node.type === 'leaf') return (node.data as { views: string[] }).views[0];
  for (const child of node.data as GridNode[]) {
    const id = firstPanel(child);
    if (id !== undefined) return id;
  }
  return undefined;
}

function lastPanel(node: GridNode): string | undefined {
  if (node.type === 'leaf') return (node.data as { views: string[] }).views.at(-1);
  for (const child of [...(node.data as GridNode[])].reverse()) {
    const id = lastPanel(child);
    if (id !== undefined) return id;
  }
  return undefined;
}

export function pruneChannelDock(
  layout: SerializedDockview,
  keep: (panelId: string) => boolean,
  requireAnchor = true,
): { layout: SerializedDockview | undefined; parked: Record<string, DockPosition> } {
  const parked: Record<string, DockPosition> = {};
  const prune = (node: GridNode, horizontal: boolean): GridNode | undefined => {
    if (node.type === 'leaf') {
      const data = node.data as { views: string[]; activeView?: string; id: string };
      const views = data.views.filter(keep);
      if (views.length === 0) return undefined;
      return {
        ...node,
        data: {
          ...data,
          views,
          activeView:
            data.activeView !== undefined && views.includes(data.activeView)
              ? data.activeView
              : views[0]!,
        },
      };
    }
    const children = node.data as GridNode[];
    const kept: GridNode[] = [];
    children.forEach((child, index) => {
      const next = prune(child, !horizontal);
      if (next !== undefined) {
        kept.push(next);
        return;
      }
      const removed = collectPanels(child);
      const before = children
        .slice(0, index)
        .map((sibling) => lastPanel(sibling))
        .filter((id): id is string => id !== undefined && keep(id))
        .at(-1);
      const after = children
        .slice(index + 1)
        .map((sibling) => firstPanel(sibling))
        .find((id): id is string => id !== undefined && keep(id));
      for (const id of removed)
        parked[id] =
          before !== undefined
            ? { neighbor: before, direction: horizontal ? 'right' : 'below' }
            : after !== undefined
              ? { neighbor: after, direction: horizontal ? 'left' : 'above' }
              : { direction: horizontal ? 'right' : 'below' };
    });
    if (kept.length === 0) return undefined;
    return { ...node, data: kept };
  };
  const horizontal = layout.grid.orientation === 'HORIZONTAL';
  const root = prune(layout.grid.root as GridNode, horizontal);
  for (const id of Object.keys(layout.panels))
    if (!keep(id) && parked[id] === undefined) parked[id] = { direction: 'right' };
  if (
    root === undefined ||
    (requireAnchor &&
      !collectPanels(root).some((id) => id === CHANNEL_BODY_PANEL || id === 'bh:workspace-rail'))
  )
    return { layout: undefined, parked };
  for (const group of layout.floatingGroups ?? [])
    for (const id of group.data?.views ?? []) parked[id] ??= { direction: 'right' };
  const docked = new Set(collectPanels(root));
  const panels = Object.fromEntries(Object.entries(layout.panels).filter(([id]) => docked.has(id)));
  const groups = new Set(collectGroups(root));
  return {
    layout: {
      grid: { ...layout.grid, root },
      panels,
      ...(layout.activeGroup !== undefined && groups.has(layout.activeGroup)
        ? { activeGroup: layout.activeGroup }
        : {}),
    },
    parked,
  };
}

function collectPanels(node: GridNode): string[] {
  if (node.type === 'leaf') return [...(node.data as { views: string[] }).views];
  return (node.data as GridNode[]).flatMap(collectPanels);
}

function collectGroups(node: GridNode): string[] {
  if (node.type === 'leaf') return [(node.data as { id: string }).id];
  return (node.data as GridNode[]).flatMap(collectGroups);
}

export function resolveDockPosition(
  api: Pick<DockviewApi, 'getPanel' | 'panels'>,
  remembered: DockPosition | undefined,
): AddPanelPositionOptions {
  if (remembered?.neighbor !== undefined && api.getPanel(remembered.neighbor) !== undefined)
    return { referencePanel: remembered.neighbor, direction: remembered.direction };
  const column = api.panels.filter(
    (panel) =>
      panel.id !== CHANNEL_BODY_PANEL &&
      panel.id !== 'bh:workspace-rail' &&
      panel.api.location.type === 'grid',
  );
  const last = column.at(-1);
  if (last !== undefined) return { referencePanel: last.id, direction: 'below' };
  return api.getPanel(CHANNEL_BODY_PANEL)
    ? { referencePanel: CHANNEL_BODY_PANEL, direction: 'right' }
    : { direction: 'right' };
}

export function resolveDefaultPosition(
  api: Pick<DockviewApi, 'getPanel' | 'panels'>,
  position: DockPanelPosition | undefined,
): AddPanelPositionOptions {
  const zone = position?.zone ?? 'right';
  const anchor = position?.relativeTo;
  if (anchor !== undefined && api.getPanel(anchor) !== undefined)
    return { referencePanel: anchor, direction: zone === 'bottom' ? 'right' : 'below' };
  if (zone === 'left') return { direction: 'left' };
  if (zone === 'bottom' && !api.getPanel('bh:workspace-rail')) return { direction: 'below' };
  if (zone === 'bottom' || zone === 'center') {
    const target =
      api.getPanel(CHANNEL_BODY_PANEL) ??
      api.panels.find((panel) => panel.id !== 'bh:workspace-rail');
    return target ? { referencePanel: target.id, direction: 'below' } : { direction: 'right' };
  }
  return resolveDockPosition(api, undefined);
}

export function allowsDockDrop(kind: string, position: string): boolean {
  if (kind === 'tab' || kind === 'header_space') return false;
  return position !== 'center';
}

export function migrateWorkPanel(stored: StoredChannelDock): StoredChannelDock {
  const old = 'group-work';
  const next = 'sessions';
  const hasSessions = !!stored.layout.panels[next];
  const hasWork = !!stored.layout.panels[old];
  const mapId = (id: string) => (id === old ? next : id);
  const panels = Object.fromEntries(
    Object.entries(stored.layout.panels)
      .filter(([id]) => id !== old || !hasSessions)
      .map(([id, panel]) => [
        mapId(id),
        id === old
          ? { ...panel, id: next, title: next, params: { ...panel.params, entryId: next } }
          : panel,
      ]),
  );
  const walk = (node: GridNode): GridNode | undefined => {
    if (node.type === 'leaf') {
      const data = node.data as { views: string[]; activeView?: string; id: string };
      const views = [...new Set(data.views.filter((id) => id !== old || !hasSessions).map(mapId))];
      if (!views.length) return undefined;
      return {
        ...node,
        data: {
          ...data,
          views,
          activeView: views.includes(mapId(data.activeView ?? ''))
            ? mapId(data.activeView!)
            : views[0]!,
        },
      };
    }
    const data = (node.data as GridNode[]).flatMap((child) => {
      const result = walk(child);
      return result ? [result] : [];
    });
    return data.length ? { ...node, data } : undefined;
  };
  const root = walk(stored.layout.grid.root as GridNode) ?? {
    ...stored.layout.grid.root,
    type: 'branch' as const,
    data: [],
  };
  const order = stored.order ?? [];
  const hidden = stored.hiddenControls ?? [];
  const explicitSessions = order.includes(next) || hidden.includes(next) || hasSessions;
  const hiddenControls = [
    ...new Set(hidden.filter((id) => id !== old || !explicitSessions).map(mapId)),
  ];
  if (hasWork && !hasSessions) {
    const index = hiddenControls.indexOf(next);
    if (index >= 0) hiddenControls.splice(index, 1);
  }
  const parked = Object.fromEntries(
    Object.entries(stored.parked)
      .filter(([id]) => id !== old || !stored.parked[next])
      .map(([id, position]) => [
        mapId(id),
        { ...position, ...(position.neighbor ? { neighbor: mapId(position.neighbor) } : {}) },
      ]),
  );
  for (const [id, position] of Object.entries(parked))
    if (position.neighbor === id) delete position.neighbor;
  const groups = new Set(collectGroups(root));
  const { activeGroup, ...layout } = stored.layout;
  return {
    ...stored,
    order: [...new Set(order.filter((id) => id !== old || !order.includes(next)).map(mapId))],
    hiddenControls,
    parked,
    layout: {
      ...layout,
      panels,
      grid: { ...layout.grid, root },
      ...(activeGroup && groups.has(activeGroup) ? { activeGroup } : {}),
    },
  };
}

function parseChannelWorkspace(value: unknown): ChannelWorkspaceState | undefined {
  if (
    !isRecord(value) ||
    typeof value['open'] !== 'boolean' ||
    !['left', 'right', 'above', 'below'].includes(value['direction'] as string) ||
    typeof value['ratio'] !== 'number' ||
    !Number.isFinite(value['ratio'])
  )
    return undefined;
  return {
    open: value['open'],
    direction: value['direction'] as DockDirection,
    ratio: Math.min(0.8, Math.max(0.2, value['ratio'])),
    hiddenControl: value['hiddenControl'] === true,
  };
}

export function migrateSessionsWorkspace(stored: StoredChannelDock): StoredChannelDock {
  let geometry: Pick<ChannelWorkspaceState, 'direction' | 'ratio'> = DEFAULT_CHANNEL_WORKSPACE;
  const walk = (node: GridNode, horizontal: boolean): GridNode | undefined => {
    if (node.type === 'leaf') {
      const data = node.data as { views: string[]; activeView?: string; id: string };
      const views = data.views.filter((id) => id !== 'sessions');
      if (!views.length) return undefined;
      return {
        ...node,
        data: {
          ...data,
          views,
          activeView: views.includes(data.activeView ?? '') ? data.activeView! : views[0]!,
        },
      };
    }
    const children = node.data as GridNode[];
    const messageIndex = children.findIndex((child) =>
      collectPanels(child).includes(CHANNEL_BODY_PANEL),
    );
    const sessionIndex = children.findIndex((child) => collectPanels(child).includes('sessions'));
    if (
      messageIndex >= 0 &&
      sessionIndex >= 0 &&
      messageIndex !== sessionIndex &&
      collectPanels(children[sessionIndex]!).length === 1 &&
      collectPanels(children[messageIndex]!).length === 1
    ) {
      const sessionSize = children[sessionIndex]!.size ?? 0;
      const messageSize = children[messageIndex]!.size ?? 0;
      geometry = {
        direction: horizontal
          ? sessionIndex < messageIndex
            ? 'left'
            : 'right'
          : sessionIndex < messageIndex
            ? 'above'
            : 'below',
        ratio:
          sessionSize > 0 && messageSize > 0
            ? Math.min(0.8, Math.max(0.2, sessionSize / (sessionSize + messageSize)))
            : 0.3,
      };
    }
    const data = children.flatMap((child) => {
      const next = walk(child, !horizontal);
      return next ? [next] : [];
    });
    return data.length ? { ...node, data } : undefined;
  };
  const root = walk(
    stored.layout.grid.root as GridNode,
    stored.layout.grid.orientation === 'HORIZONTAL',
  ) ?? { ...stored.layout.grid.root, type: 'branch' as const, data: [] };
  const panels = Object.fromEntries(
    Object.entries(stored.layout.panels).filter(([id]) => id !== 'sessions'),
  );
  const groups = new Set(collectGroups(root));
  const { activeGroup, ...layout } = stored.layout;
  return {
    ...stored,
    sessionSeed: stored.sessionSeed ?? {
      ...geometry,
      open: !!stored.layout.panels['sessions'],
      hiddenControl: stored.hiddenControls?.includes('sessions') ?? false,
    },
    channelWorkspaces: stored.channelWorkspaces ?? {},
    order: stored.order?.filter((id) => id !== 'sessions'),
    hiddenControls: stored.hiddenControls?.filter((id) => id !== 'sessions'),
    parked: Object.fromEntries(
      Object.entries(stored.parked)
        .filter(([id]) => id !== 'sessions')
        .map(([id, position]) => [
          id,
          position.neighbor === 'sessions'
            ? { ...position, neighbor: CHANNEL_BODY_PANEL }
            : position,
        ]),
    ),
    layout: {
      ...layout,
      panels,
      grid: { ...layout.grid, root },
      ...(activeGroup && groups.has(activeGroup) ? { activeGroup } : {}),
    },
  };
}

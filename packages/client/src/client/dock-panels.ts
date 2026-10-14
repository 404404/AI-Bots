import type { ComponentType } from 'react';

import type { ChannelSidebarEntry } from './channel-sidebar.js';

/** `channel` panels follow the active Channel; `global` panels do not (ADR-0203). */
export type DockPanelScope = 'global' | 'channel';

/**
 * Where a panel opens the first time, before the Human has moved it: the
 * leftmost column, below the Channel body, the right column, or a bottom row
 * across the layout. With `relativeTo` open, the panel stacks right after that
 * panel instead. A panel the Human has closed reopens where it was.
 */
export interface DockPanelPosition {
  readonly zone: 'left' | 'center' | 'right' | 'bottom';
  readonly relativeTo?: string | undefined;
}

export interface DockPanelChannel {
  readonly id: string;
  readonly type: 'dm' | 'group';
  readonly botSlug: string | undefined;
}

export interface DockPanelProps {
  /** The active Channel for a `channel` panel; always undefined for a `global` panel. */
  readonly channel: DockPanelChannel | undefined;
}

export interface DockPanel {
  readonly id: string;
  readonly title: string;
  /** A Channel sidebar glyph name, such as `list-todo`; unknown names draw a generic panel glyph. */
  readonly icon?: string | undefined;
  readonly scope: DockPanelScope;
  readonly defaultPosition?: DockPanelPosition | undefined;
  readonly order?: number | undefined;
  readonly component: ComponentType<DockPanelProps>;
}

/** A registered panel; `entry` is set when it came through the `channelSidebar` Consumer. */
export interface DockPanelRegistration extends DockPanel {
  readonly entry?: ChannelSidebarEntry | undefined;
}

/** What the mounted Bot mode layout lends the Service while it is on screen. */
export interface DockPanelLayout {
  open(id: string): void;
  close(id: string): void;
}

export interface DockPanelRegistry {
  register(panel: DockPanel): () => void;
  panels(): readonly DockPanelRegistration[];
  /** Ids of the panels open in the Bot mode layout; empty while no layout is mounted. */
  openPanels(): readonly string[];
  isOpen(id: string): boolean;
  open(id: string): void;
  close(id: string): void;
  toggle(id: string): void;
  subscribe(listener: () => void): () => void;
}

export interface DockPanelHost extends DockPanelRegistry {
  /** The `channelSidebar` compatibility path: a Channel sidebar entry as a `channel` panel. */
  registerEntry(entry: ChannelSidebarEntry, defaultPosition?: DockPanelPosition): () => void;
  /** Called by the mounted layout; returns the detach. */
  attach(layout: DockPanelLayout): () => void;
  /** Called by the mounted layout after every layout change. */
  reportOpen(ids: readonly string[]): void;
}

const NO_IDS: readonly string[] = [];

function compare(left: DockPanelRegistration, right: DockPanelRegistration): number {
  return (left.order ?? 0) - (right.order ?? 0) || left.id.localeCompare(right.id);
}

/** The dock's panels when no `dockPanels` Service is supplied, as in isolated tests. */
export function dockPanelsFromEntries(
  entries: readonly ChannelSidebarEntry[],
): readonly DockPanelRegistration[] {
  const registry = createDockPanelRegistry();
  for (const entry of entries) registry.registerEntry(entry);
  return registry.panels();
}

export function createDockPanelRegistry(): DockPanelHost {
  const registrations = new Map<string, DockPanelRegistration>();
  const listeners = new Set<() => void>();
  let ordered: readonly DockPanelRegistration[] = [];
  let open: readonly string[] = NO_IDS;
  let layout: DockPanelLayout | undefined;

  const notify = (): void => {
    for (const listener of listeners) listener();
  };

  const add = (registration: DockPanelRegistration): (() => void) => {
    if (registrations.has(registration.id))
      throw new Error(`duplicate Dock panel: ${registration.id}`);
    registrations.set(registration.id, registration);
    ordered = [...registrations.values()].sort(compare);
    notify();
    return () => {
      if (registrations.get(registration.id) !== registration) return;
      registrations.delete(registration.id);
      ordered = [...registrations.values()].sort(compare);
      notify();
    };
  };

  const registry: DockPanelHost = {
    register: (panel) => add({ ...panel, entry: undefined }),
    registerEntry: (entry, defaultPosition) =>
      add({
        id: entry.id,
        title: entry.label,
        icon: entry.icon,
        scope: 'channel',
        defaultPosition,
        order: entry.order,
        component: () => null,
        entry,
      }),
    panels: () => ordered,
    openPanels: () => open,
    isOpen: (id) => open.includes(id),
    open: (id) => layout?.open(id),
    close: (id) => layout?.close(id),
    toggle: (id) => (open.includes(id) ? registry.close(id) : registry.open(id)),
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    attach(next) {
      layout = next;
      return () => {
        if (layout !== next) return;
        layout = undefined;
        if (open.length === 0) return;
        open = NO_IDS;
        notify();
      };
    },
    reportOpen(ids) {
      if (ids.length === open.length && ids.every((id, index) => open[index] === id)) return;
      open = ids.length === 0 ? NO_IDS : [...ids];
      notify();
    },
  };
  return registry;
}

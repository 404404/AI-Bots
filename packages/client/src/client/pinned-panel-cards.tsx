import { useSyncExternalStore, type ReactElement } from 'react';
import * as stylex from '@stylexjs/stylex';
import { Tooltip } from '@deepseek-ai/dsh-client-ui-primitives';

import { ChannelSidebarIcon } from './channel-sidebar-icon.js';
import type { DockPanelRegistry } from './dock-panels.js';
import { hooked } from './ds/hooked.js';
import { border, color, radius, space, text } from './ds/tokens.stylex.js';
import type { BotHarnessTranslate } from './locale.js';

export interface PinnedPanelBadge {
  readonly count: number;
  readonly dot: boolean;
  readonly label?: string | undefined;
}

export interface PinnedPanelCardsProps {
  registry: DockPanelRegistry;
  collapsed: boolean;
  order?: readonly string[] | undefined;
  shortcut?: ((id: string) => string | undefined) | undefined;
  onOrderChange?: ((ids: readonly string[]) => void) | undefined;
  hiddenIds?: readonly string[] | undefined;
  current?: string | undefined;
  badge?: ((id: string) => PinnedPanelBadge | undefined) | undefined;
  fallback?: ((id: string) => (() => void) | undefined) | undefined;
  tourOf?: ((id: string) => string | undefined) | undefined;
  t: BotHarnessTranslate;
}

export function PinnedPanelCards({
  registry,
  collapsed,
  order,
  shortcut,
  onOrderChange,
  hiddenIds,
  current,
  badge,
  fallback,
  tourOf,
  t,
}: PinnedPanelCardsProps): ReactElement | null {
  const panels = useSyncExternalStore(registry.subscribe, registry.panels, registry.panels);
  const openIds = useSyncExternalStore(
    registry.subscribe,
    registry.openPanels,
    registry.openPanels,
  );
  const available = useSyncExternalStore(
    registry.subscribe,
    registry.available,
    registry.available,
  );
  const visible = panels.filter((panel) => !hiddenIds?.includes(panel.id));
  const ids = [...new Set([...(order ?? []), ...visible.map((panel) => panel.id)])];
  const sorted = [...visible].sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
  const move = (id: string, before: string): void => {
    if (id === before || !ids.includes(id)) return;
    const next = ids.filter((item) => item !== id);
    next.splice(next.indexOf(before), 0, id);
    onOrderChange?.(next);
  };
  if (sorted.length === 0) return null;
  return (
    <div
      {...hooked('bh-pinned-panels', styles.grid, collapsed && styles.rail)}
      role="group"
      aria-label={t('dock.panels')}
    >
      {sorted.map((panel, index) => {
        const open = openIds.includes(panel.id) || current === panel.id;
        const run = available ? () => registry.toggle(panel.id) : fallback?.(panel.id);
        const mark = badge?.(panel.id);
        const label = [
          panel.title,
          ...(shortcut?.(panel.id) ? [shortcut(panel.id)!] : []),
          ...(mark?.label === undefined ? [] : [mark.label]),
          ...(run === undefined ? [t('dock.cardUnavailable')] : []),
        ].join(' · ');
        return (
          <Tooltip key={panel.id} label={label} side={collapsed ? 'right' : 'bottom'} delayMs={400}>
            <button
              type="button"
              {...hooked(
                'bh-pinned-panel',
                styles.card,
                collapsed && styles.railCard,
                open && styles.open,
                collapsed && open && styles.railOpen,
                run === undefined && styles.disabled,
              )}
              data-pinned-panel={panel.id}
              data-bh-tour={tourOf?.(panel.id)}
              data-open={open ? 'true' : undefined}
              aria-label={label}
              aria-pressed={open}
              aria-disabled={run === undefined ? true : undefined}
              onClick={run}
              draggable={onOrderChange !== undefined}
              aria-description={onOrderChange ? t('workspace.reorderHint') : undefined}
              onDragStart={(event) => {
                if (!onOrderChange) return;
                event.dataTransfer.setData('application/x-bh-panel-order', panel.id);
                event.dataTransfer.effectAllowed = 'move';
              }}
              onDragOver={(event) => {
                if (
                  onOrderChange &&
                  event.dataTransfer.types.includes('application/x-bh-panel-order')
                )
                  event.preventDefault();
              }}
              onDrop={(event) => {
                if (
                  !onOrderChange ||
                  !event.dataTransfer.types.includes('application/x-bh-panel-order')
                )
                  return;
                event.preventDefault();
                event.stopPropagation();
                move(event.dataTransfer.getData('application/x-bh-panel-order'), panel.id);
              }}
              onKeyDown={(event) => {
                if (
                  !onOrderChange ||
                  !event.altKey ||
                  !['ArrowUp', 'ArrowDown'].includes(event.key)
                )
                  return;
                event.preventDefault();
                if (event.key === 'ArrowUp' && index > 0) move(panel.id, sorted[index - 1]!.id);
                if (event.key === 'ArrowDown' && index < sorted.length - 1)
                  move(sorted[index + 1]!.id, panel.id);
              }}
            >
              <ChannelSidebarIcon name={panel.icon} size={collapsed ? 18 : 16} />
              {mark === undefined ? null : mark.count > 0 && !collapsed ? (
                <span {...stylex.props(styles.count)} data-pinned-panel-count="">
                  {mark.count > 99 ? '99+' : mark.count}
                </span>
              ) : mark.count > 0 || mark.dot ? (
                <span {...stylex.props(styles.dot)} data-pinned-panel-dot="" />
              ) : null}
            </button>
          </Tooltip>
        );
      })}
    </div>
  );
}

const styles = stylex.create({
  grid: {
    display: 'grid',
    flexShrink: 0,
    gridTemplateColumns: 'repeat(auto-fill, minmax(44px, 1fr))',
    gap: space.x3,
    marginInline: space.x1,
    marginBottom: space.x4,
  },
  rail: {
    gridTemplateColumns: '36px',
    justifyContent: 'center',
    gap: space.x3,
    marginInline: 0,
  },
  card: {
    position: 'relative',
    boxSizing: 'border-box',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '40px',
    padding: 0,
    borderWidth: border.hairline,
    borderStyle: 'solid',
    borderColor: 'transparent',
    outline: {
      default: 'none',
      ':focus-visible': `${border.focus} solid ${color.accent}`,
    },
    outlineOffset: '-2px',
    borderRadius: radius.md,
    cornerShape: 'round',
    color: color.muted,
    backgroundColor: {
      default: color.hover,
      ':hover': color.selected,
    },
    cursor: 'pointer',
    transitionDuration: '120ms',
    transitionProperty: 'background-color, color, border-color',
    '@media (prefers-reduced-motion: reduce)': {
      transitionDuration: '0s',
    },
  },
  railCard: {
    width: '36px',
    height: '36px',
  },
  open: {
    borderColor: color.accent,
    color: color.accent,
    backgroundColor: {
      default: color.accentTint,
      ':hover': color.accentTint,
    },
  },
  railOpen: {
    borderColor: 'transparent',
  },
  disabled: {
    opacity: 0.45,
    cursor: 'default',
    backgroundColor: {
      default: color.hover,
      ':hover': color.hover,
    },
  },
  count: {
    position: 'absolute',
    top: `calc(-1 * ${space.x2})`,
    right: `calc(-1 * ${space.x2})`,
    boxSizing: 'border-box',
    minWidth: '18px',
    paddingInline: space.x2,
    borderRadius: radius.lg,
    color: color.onDanger,
    backgroundColor: color.danger,
    fontSize: text.metaSize,
    lineHeight: text.metaLine,
    textAlign: 'center',
    fontVariantNumeric: 'tabular-nums',
  },
  dot: {
    position: 'absolute',
    top: space.x2,
    right: space.x2,
    width: '6px',
    height: '6px',
    borderRadius: radius.round,
    backgroundColor: color.danger,
  },
});

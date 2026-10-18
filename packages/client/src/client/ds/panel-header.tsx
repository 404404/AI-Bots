import { useRef, type ReactElement, type ReactNode } from 'react';
import * as stylex from '@stylexjs/stylex';
import { IconChevronDownOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives';

import { border, color, radius, size, space, text } from './tokens.stylex.js';

const styles = stylex.create({
  header: {
    display: 'flex',
    alignItems: 'center',
    minWidth: 0,
    marginBlock: space.x1,
    marginInline: space.x2,
  },
  head: {
    display: 'flex',
    alignItems: 'center',
    gap: space.x3,
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: 0,
    height: size.row,
    paddingBlock: 0,
    paddingInline: space.x3,
    borderWidth: 0,
    borderStyle: 'none',
    borderRadius: radius.sm,
    backgroundColor: { default: 'transparent', ':hover': color.hover },
    color: 'inherit',
    fontFamily: 'inherit',
    textAlign: 'start',
    cursor: 'pointer',
    outline: { default: 'none', ':focus-visible': `${border.focus} solid ${color.accent}` },
    outlineOffset: '-2px',
  },
  hide: { flexGrow: 0, flexBasis: 'auto', maxWidth: '100%' },
  spacer: { flexGrow: 1 },
  static: {
    cursor: 'default',
    backgroundColor: 'transparent',
  },
  locked: {
    pointerEvents: 'none',
  },
  dimmed: { cursor: 'default', opacity: 0.6 },
  fixed: { flexGrow: 0, flexBasis: 'auto', maxWidth: '40%' },
  chevron: {
    display: 'inline-flex',
    flexShrink: 0,
    color: color.subtle,
    transition: 'transform 150ms var(--ds-ease-in-out)',
  },
  collapsed: { transform: 'rotate(-90deg)' },
  icon: {
    display: 'inline-flex',
    flexShrink: 0,
    color: color.muted,
  },
  label: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontSize: text.titleSize,
    lineHeight: text.titleLine,
  },
  labelFixed: { flexGrow: 0, flexBasis: 'auto' },
  struck: { textDecoration: 'line-through', opacity: 0.6 },
  badge: {
    display: 'inline-flex',
    flexShrink: { default: 0, ':has(.bh-channel-sidebar-summary)': 1 },
    minWidth: 0,
    maxWidth: { default: 'none', ':has(.bh-channel-sidebar-summary)': '55%' },
  },
  tabs: {
    display: 'flex',
    alignItems: 'center',
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: 0,
    overflowX: 'auto',
    whiteSpace: 'nowrap',
  },
  action: {
    display: 'inline-flex',
    alignItems: 'center',
    minWidth: 0,
    maxWidth: { default: 'none', ':has([data-session-target])': '60%' },
    flexShrink: { default: 0, ':has([data-session-target])': 1 },
    paddingInlineEnd: space.x1,
  },
});

export interface PanelHeaderDisclosure {
  readonly expanded: boolean;
  readonly controls: string;
  readonly disabled: boolean;
  readonly chevron: boolean;
  readonly onToggle: (() => void) | undefined;
}

export function PanelHeader({
  icon,
  label,
  badge,
  tabs,
  action,
  disclosure,
  onHide,
  hideLabel,
  dimmed = false,
  locked = false,
  struck = false,
}: {
  readonly icon?: ReactNode;
  readonly label: ReactNode;
  readonly badge?: ReactNode;
  readonly tabs?: ReactNode;
  readonly action?: ReactNode;
  readonly disclosure?: PanelHeaderDisclosure | undefined;
  readonly onHide?: (() => void) | undefined;
  readonly hideLabel?: string | undefined;
  readonly dimmed?: boolean;
  readonly locked?: boolean;
  readonly struck?: boolean;
}): ReactElement {
  const fixed = tabs !== undefined;
  const pointer = useRef<{ x: number; y: number; dragged: boolean }>();
  const headingContent = (
    <>
      {icon === undefined ? null : (
        <span aria-hidden="true" {...stylex.props(styles.icon)}>
          {icon}
        </span>
      )}
      <span
        data-panel-label=""
        title={typeof label === 'string' ? label : undefined}
        {...stylex.props(styles.label, fixed && styles.labelFixed, struck && styles.struck)}
      >
        {label}
      </span>
    </>
  );
  const badgeContent =
    badge === undefined ? null : <span {...stylex.props(styles.badge)}>{badge}</span>;
  const content = (
    <>
      {headingContent}
      {badgeContent}
    </>
  );
  return (
    <div {...stylex.props(styles.header)}>
      {onHide !== undefined ? (
        <button
          type="button"
          data-panel-head=""
          data-panel-hide=""
          aria-label={hideLabel}
          title={hideLabel}
          draggable
          onPointerDown={(event) => {
            pointer.current = { x: event.clientX, y: event.clientY, dragged: false };
          }}
          onPointerMove={(event) => {
            if (
              pointer.current &&
              Math.hypot(event.clientX - pointer.current.x, event.clientY - pointer.current.y) > 4
            )
              pointer.current.dragged = true;
          }}
          onDragStart={() => {
            pointer.current = { x: 0, y: 0, dragged: true };
          }}
          onClick={(event) => {
            if (event.detail !== 0 && pointer.current?.dragged) return;
            onHide();
          }}
          {...stylex.props(styles.head, styles.hide, fixed && styles.fixed)}
        >
          {headingContent}
        </button>
      ) : disclosure === undefined ? (
        <div
          data-panel-head=""
          {...stylex.props(
            styles.head,
            styles.static,
            fixed && styles.fixed,
            dimmed && styles.dimmed,
          )}
        >
          {content}
        </div>
      ) : (
        <button
          type="button"
          data-panel-head=""
          aria-expanded={disclosure.expanded}
          aria-controls={disclosure.controls}
          aria-disabled={dimmed ? true : undefined}
          disabled={disclosure.disabled}
          onClick={disclosure.onToggle}
          {...stylex.props(
            styles.head,
            fixed && styles.fixed,
            dimmed && styles.dimmed,
            locked && styles.locked,
          )}
        >
          {disclosure.chevron ? (
            <span
              aria-hidden="true"
              data-panel-chevron=""
              {...stylex.props(styles.chevron, !disclosure.expanded && styles.collapsed)}
            >
              <IconChevronDownOutlineRegular size={14} />
            </span>
          ) : null}
          {content}
        </button>
      )}
      {onHide === undefined ? null : badgeContent}
      {tabs === undefined ? null : (
        <span data-panel-tabs="" {...stylex.props(styles.tabs)}>
          {tabs}
        </span>
      )}
      {onHide !== undefined && tabs === undefined ? (
        <span aria-hidden="true" {...stylex.props(styles.spacer)} />
      ) : null}
      {action === undefined ? null : <span {...stylex.props(styles.action)}>{action}</span>}
    </div>
  );
}

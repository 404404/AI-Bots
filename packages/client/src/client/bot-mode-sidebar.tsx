import type { ReactElement, ReactNode } from 'react';
import * as stylex from '@stylexjs/stylex';
import type { SnapshotSelectorHook } from '@deepseek-ai/dsh-client-store';
import {
  IconPanelLeftOutlineRegular,
  IconSettingsOutlineRegular,
  Tooltip,
  isDarwinDesktop,
} from '@deepseek-ai/dsh-client-ui-primitives';

import type { BotModeSortMode } from '../bot-mode-settings.js';
import type { BridgeActions } from './actions.js';
import { BotIcon } from './bot-icon.js';
import type { BotModePrefsSnapshot } from './bot-mode-prefs.js';
import { BotSidebar, useClientState } from './bot-sidebar.js';
import type { ChannelSidebarRegistry } from './channel-sidebar.js';
import { hooked } from './ds/hooked.js';
import { border, color, radius, space, text } from './ds/tokens.stylex.js';
import { ExitIcon } from './exit-icon.js';
import { InboxIcon } from './inbox-icon.js';
import type { BotHarnessTranslate } from './locale.js';
import { useMountedResource } from './mounted-resource.js';
import { OnboardingLauncher } from './onboarding-checklist-view.js';
import type { ShortcutBindings } from './shortcut-bindings.js';
import type { WindowCompanions } from './window-companions.js';

const INBOX_REFRESH_MS = 10_000;

export interface BotModeSidebarProps {
  collapsed: boolean;
  width: number;
  actions: BridgeActions;
  companion?: WindowCompanions | undefined;
  channelSidebar?: ChannelSidebarRegistry | undefined;
  shortcutBindings?: ShortcutBindings | undefined;
  useBotModePrefs: SnapshotSelectorHook<BotModePrefsSnapshot>;
  setSortMode: (mode: BotModeSortMode) => void;
  setSectionSortMode: (sectionId: string, mode: BotModeSortMode | undefined) => void;
  exitBotMode: () => void;
  toggleSidebar: () => void;
  openBotSettings: () => void;
  t: BotHarnessTranslate;
}

export function BotModeSidebar(props: BotModeSidebarProps): ReactElement {
  const { collapsed, actions, useBotModePrefs, t } = props;
  const wide = !collapsed;
  const icon = useBotModePrefs((prefs) => prefs.botIcon);
  const state = useClientState();
  const unread = state.humanInbox.unreadCount;
  const inboxLabel = [
    t('activityCenter.title'),
    ...(unread > 0 ? [t('humanInbox.unreadCount', { count: String(unread) })] : []),
    ...(state.humanInbox.hasAction ? [t('humanInbox.action')] : []),
  ].join(' · ');
  const inboxCurrent = state.selection?.kind === 'inbox';
  const toggleLabel = t(collapsed ? 'panel.sidebar.open' : 'panel.sidebar.collapse');
  const darwin = isDarwinDesktop();
  const rootMount = useMountedResource<HTMLDivElement>(() => {
    void actions.refreshHumanInboxStatus();
    const timer = window.setInterval(
      () => void actions.refreshHumanInboxStatus(),
      INBOX_REFRESH_MS,
    );
    return () => window.clearInterval(timer);
  }, [actions]);

  const row = (
    label: string,
    glyph: ReactNode,
    onClick: () => void,
    extra: {
      tour?: string;
      current?: boolean;
      trailing?: ReactNode;
      dot?: boolean;
    } = {},
  ): ReactElement => (
    <Tooltip label={label} side="right" delayMs={500} disabled={wide}>
      <button
        type="button"
        {...hooked(
          'bh-mode-sidebar-row',
          styles.row,
          collapsed && styles.railRow,
          extra.current === true && styles.current,
        )}
        data-bh-tour={extra.tour}
        aria-label={label}
        aria-current={extra.current === true ? 'page' : undefined}
        onClick={onClick}
      >
        <span {...stylex.props(styles.glyph)}>
          {glyph}
          {collapsed && extra.dot === true ? <span {...stylex.props(styles.dot)} /> : null}
        </span>
        {wide ? <span {...stylex.props(styles.label)}>{label.split(' · ')[0]}</span> : null}
        {wide ? extra.trailing : null}
      </button>
    </Tooltip>
  );

  return (
    <div
      ref={rootMount}
      {...hooked('bh-root bh-mode-sidebar', styles.root, collapsed && styles.rootCollapsed)}
      data-collapsed={collapsed ? 'true' : undefined}
      aria-label={t('panel.label')}
      role="navigation"
    >
      {darwin && wide ? <div {...stylex.props(styles.darwinStrip)} data-window-drag /> : null}
      <div {...stylex.props(styles.logoRow, collapsed && styles.logoRowCollapsed)} data-window-drag>
        {wide ? (
          <span {...stylex.props(styles.brand)} data-bh-tour="bot-mode-brand">
            <BotIcon icon={icon} size={24} />
            <span {...stylex.props(styles.brandName)}>{t('panel.label')}</span>
          </span>
        ) : null}
        <Tooltip label={toggleLabel} side="right" delayMs={500}>
          <button
            type="button"
            {...hooked(
              'bh-mode-sidebar-toggle',
              styles.iconButton,
              collapsed && styles.iconButtonCollapsed,
            )}
            aria-label={toggleLabel}
            onClick={props.toggleSidebar}
          >
            {collapsed ? (
              <BotIcon icon={icon} size={24} />
            ) : (
              <IconPanelLeftOutlineRegular size={16} />
            )}
          </button>
        </Tooltip>
      </div>
      <div {...stylex.props(styles.list, collapsed && styles.listCollapsed)}>
        {row(
          inboxLabel,
          <InboxIcon size={wide ? 16 : 18} />,
          () => {
            void actions.openActivityCenter();
          },
          {
            tour: 'inbox',
            current: inboxCurrent,
            dot: unread > 0 || state.humanInbox.hasAction,
            trailing:
              unread > 0 ? (
                <span {...stylex.props(styles.count)}>{unread > 99 ? '99+' : unread}</span>
              ) : null,
          },
        )}
      </div>
      <div {...stylex.props(styles.region, collapsed && styles.regionCollapsed)}>
        <BotSidebar
          wide={wide}
          headerEnd={<OnboardingLauncher actions={actions} t={t} placement="header" />}
          actions={actions}
          companion={props.companion}
          useBotModePrefs={useBotModePrefs}
          channelSidebar={props.channelSidebar}
          shortcutBindings={props.shortcutBindings}
          setSortMode={props.setSortMode}
          setSectionSortMode={props.setSectionSortMode}
          t={t}
        />
      </div>
      <div {...stylex.props(styles.list, styles.foot, collapsed && styles.listCollapsed)}>
        {row(
          t('panel.settings'),
          <IconSettingsOutlineRegular size={wide ? 16 : 18} />,
          () => {
            props.openBotSettings();
          },
          { tour: 'bot-settings' },
        )}
        {row(t('panel.exit'), <ExitIcon size={wide ? 16 : 18} />, props.exitBotMode, {
          tour: 'bot-mode',
        })}
      </div>
    </div>
  );
}

const styles = stylex.create({
  root: {
    '--dsh-sidebar-inline-padding': space.x4,
    boxSizing: 'border-box',
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    minWidth: 0,
    paddingBlock: space.x2,
    paddingInline: space.x4,
    color: color.fg,
    fontSize: text.titleSize,
  },
  rootCollapsed: {
    alignItems: 'center',
    paddingTop: space.x5,
    paddingInline: space.x3,
  },
  darwinStrip: {
    flexShrink: 0,
    height: '40px',
  },
  logoRow: {
    boxSizing: 'border-box',
    display: 'flex',
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: space.x3,
    height: '60px',
    marginBottom: space.x2,
    paddingBlock: space.x3,
    paddingInlineStart: space.x2,
    overflow: 'hidden',
  },
  logoRowCollapsed: {
    justifyContent: 'center',
    height: '36px',
    marginBottom: space.x4,
    padding: 0,
    overflow: 'visible',
  },
  brand: {
    display: 'inline-flex',
    flexGrow: 1,
    alignItems: 'center',
    gap: space.x3,
    minWidth: 0,
    overflow: 'hidden',
  },
  brandName: {
    overflow: 'hidden',
    fontSize: text.titleSize,
    fontWeight: text.strong,
    lineHeight: text.titleLine,
    whiteSpace: 'nowrap',
    textOverflow: 'ellipsis',
  },
  iconButton: {
    display: 'inline-flex',
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    width: '28px',
    height: '28px',
    padding: 0,
    borderWidth: 0,
    borderStyle: 'none',
    outline: { default: 'none', ':focus-visible': `${border.focus} solid ${color.accent}` },
    outlineOffset: '-2px',
    borderRadius: radius.sm,
    color: color.muted,
    backgroundColor: {
      default: 'transparent',
      ':hover': color.hover,
    },
    cursor: 'pointer',
  },
  iconButtonCollapsed: {
    width: '36px',
    height: '36px',
    borderRadius: radius.md,
    color: color.fg,
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    flexShrink: 0,
    gap: space.x2,
    marginBottom: space.x3,
  },
  listCollapsed: {
    alignItems: 'center',
    gap: space.x4,
    marginBottom: space.x4,
  },
  foot: {
    marginTop: space.x2,
    marginBottom: 0,
  },
  row: {
    boxSizing: 'border-box',
    display: 'flex',
    alignItems: 'center',
    gap: space.x3,
    minHeight: '36px',
    marginInline: space.x1,
    paddingBlock: space.x3,
    paddingInline: space.x3,
    borderWidth: 0,
    borderStyle: 'none',
    outline: { default: 'none', ':focus-visible': `${border.focus} solid ${color.accent}` },
    outlineOffset: '-2px',
    borderRadius: radius.md,
    color: color.fg,
    font: 'inherit',
    lineHeight: text.bodyLine,
    textAlign: 'start',
    backgroundColor: {
      default: 'transparent',
      ':hover': color.hover,
    },
    cursor: 'pointer',
  },
  railRow: {
    justifyContent: 'center',
    width: '36px',
    height: '36px',
    margin: 0,
    padding: 0,
  },
  current: {
    backgroundColor: color.hover,
  },
  glyph: {
    position: 'relative',
    display: 'inline-flex',
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    position: 'absolute',
    top: `calc(-1 * ${space.x1})`,
    right: `calc(-1 * ${space.x1})`,
    width: '6px',
    height: '6px',
    borderRadius: radius.round,
    backgroundColor: color.danger,
  },
  label: {
    flexGrow: 1,
    minWidth: 0,
    overflow: 'hidden',
    whiteSpace: 'nowrap',
    textOverflow: 'ellipsis',
  },
  count: {
    flexShrink: 0,
    minWidth: '18px',
    paddingInline: space.x2,
    borderRadius: radius.lg,
    color: color.onDanger,
    backgroundColor: color.danger,
    fontSize: text.metaSize,
    lineHeight: text.metaLine,
    textAlign: 'center',
  },
  region: {
    display: 'flex',
    flexDirection: 'column',
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: '0%',
    minHeight: 0,
    marginInlineStart: `calc(-1 * ${space.x2})`,
    marginInlineEnd: `calc(-1 * ${space.x4})`,
    paddingInlineStart: space.x2,
    overflow: 'hidden',
  },
  regionCollapsed: {
    alignSelf: 'stretch',
    margin: 0,
    padding: 0,
  },
});

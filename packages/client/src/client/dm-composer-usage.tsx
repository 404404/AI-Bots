import { useId, useState, type CSSProperties, type ReactElement, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import {
  IconChevronRightOutlineRegular,
  IconCloseOutlineRegular,
} from '@deepseek-ai/dsh-client-ui-primitives';
import type { BridgeActions } from './actions.js';
import type { ProfileActivity, ProfileSessionUsage } from './bridge.js';
import type { BotSummary } from './store.js';
import type { BotHarnessTranslate } from './locale.js';
import { useMountedResource } from './mounted-resource.js';
import { compactTokenCount, profileTokenSummaryText } from './profile-token-summary.js';
import { ChannelSidebarIcon } from './channel-sidebar-icon.js';

export function DmComposerUsagePopover({
  bot,
  channelId,
  actions,
  activity,
  t,
  trigger,
  onClose,
  onDetails,
}: {
  bot: BotSummary;
  channelId: string;
  actions: BridgeActions;
  activity: ProfileActivity | undefined;
  t: BotHarnessTranslate;
  trigger: RefObject<HTMLButtonElement>;
  onClose(): void;
  onDetails(): void;
}): ReactElement {
  const titleId = useId();
  const [result, setResult] = useState<ProfileSessionUsage>();
  const [failed, setFailed] = useState(false);
  const [position, setPosition] = useState<CSSProperties>({ visibility: 'hidden' });
  const mount = useMountedResource<HTMLDivElement>(
    (node) => {
      let active = true;
      const place = () => {
        const rect = trigger.current?.getBoundingClientRect();
        if (rect === undefined) return;
        const width = Math.min(360, window.innerWidth - 32);
        setPosition({
          width,
          left: Math.max(16, Math.min(rect.right - width, window.innerWidth - width - 16)),
          bottom: Math.max(8, window.innerHeight - rect.top + 8),
        });
      };
      place();
      node.focus();
      void actions.profileSessionUsage(channelId).then(
        (value) => {
          if (!active) return;
          if (value.slug !== bot.slug) setFailed(true);
          else setResult(value);
        },
        () => {
          if (active) setFailed(true);
        },
      );
      const outside = (event: PointerEvent) => {
        if (
          event.target instanceof Node &&
          !node.contains(event.target) &&
          !trigger.current?.contains(event.target)
        )
          onClose();
      };
      const escape = (event: KeyboardEvent) => {
        if (event.key !== 'Escape' || event.defaultPrevented) return;
        event.preventDefault();
        onClose();
        trigger.current?.focus();
      };
      document.addEventListener('pointerdown', outside);
      document.addEventListener('keydown', escape);
      window.addEventListener('resize', place);
      window.addEventListener('scroll', place, true);
      return () => {
        active = false;
        document.removeEventListener('pointerdown', outside);
        document.removeEventListener('keydown', escape);
        window.removeEventListener('resize', place);
        window.removeEventListener('scroll', place, true);
      };
    },
    [actions, channelId, bot.slug],
  );
  const rows = result?.rows ?? [];
  const sessionCount = (row: ProfileSessionUsage['rows'][number]) => {
    if (row.status === 'unavailable') return t('composerContext.unavailable');
    if (row.totalTokens === null) return t('profile.usage.unknown');
    const count = compactTokenCount(row.totalTokens);
    return row.status === 'partial' ? t('composerContext.partial', { count }) : count;
  };
  return createPortal(
    <div
      ref={mount}
      className="bh-composer-usage-popover"
      role="dialog"
      aria-labelledby={titleId}
      tabIndex={-1}
      style={position}
    >
      <div className="bh-composer-usage-head">
        <strong id={titleId}>{t('composerContext.usageTitle')}</strong>
        <button
          type="button"
          onClick={() => {
            onClose();
            trigger.current?.focus();
          }}
          aria-label={t('approval.cancel')}
        >
          <IconCloseOutlineRegular size={16} />
        </button>
      </div>
      <div className="bh-composer-usage-total">
        <span>{bot.displayName}</span>
        <strong>
          {t('composerContext.tokens', { count: profileTokenSummaryText(activity, t, true) })}
        </strong>
      </div>
      <p className="bh-composer-usage-caption">
        {t('composerContext.usageWindow', { weeks: activity?.weeks ?? 26 })}
      </p>
      {failed ? (
        <p role="status">{t('composerContext.unavailable')}</p>
      ) : result === undefined ? (
        <p role="status">{t('composerContext.loading')}</p>
      ) : (
        <>
          <p className="bh-composer-usage-caption">{t('composerContext.sessionScope')}</p>
          {(['orchestrator', 'assignment'] as const).map((role) => (
            <section key={role} className="bh-composer-usage-section">
              <h3>
                {t(
                  role === 'orchestrator'
                    ? 'composerContext.currentSession'
                    : 'composerContext.recentAssignments',
                )}
              </h3>
              {rows.filter((row) => row.role === role).length === 0 ? (
                <p className="bh-composer-usage-caption">{t('composerContext.noSessions')}</p>
              ) : (
                rows
                  .filter((row) => row.role === role)
                  .map((row) => (
                    <div className="bh-composer-usage-row" key={row.sessionId}>
                      <ChannelSidebarIcon
                        name={role === 'orchestrator' ? 'bot' : 'list-checks'}
                        size={14}
                      />
                      <span title={row.label}>
                        {role === 'orchestrator' ? 'Orchestrator' : row.label}
                      </span>
                      <strong>{sessionCount(row)}</strong>
                    </div>
                  ))
              )}
            </section>
          ))}
        </>
      )}
      <button type="button" className="bh-composer-usage-details" onClick={onDetails}>
        <span>{t('composerContext.details')}</span>
        <IconChevronRightOutlineRegular size={16} />
      </button>
    </div>,
    document.body,
  );
}

import { useState, type ReactElement } from 'react';
import {
  IconChevronDownOutlineRegular,
  IconStopFillRegular,
} from '@deepseek-ai/dsh-client-ui-primitives';
import {
  PersonaBotAvatar,
  personaBotActivitySummary,
  type PersonaBotFacepileItem,
} from './avatar.js';
import { attentionCount } from './activity-attention.js';
import type { ChannelComposerActivity } from './channel-composer.js';
import type { BotHarnessTranslate } from './locale.js';
import { SessionRoleIcon } from './session-role-icon.js';
import { sessionLatestSummary } from './session-summary.js';

const MAX_WORKING_ROWS = 2;

export interface TimelineWorkingRows {
  items: readonly PersonaBotFacepileItem[];
  more: number;
}

export function timelineWorkingRows(
  activity: ChannelComposerActivity | undefined,
  streamingBotSlugs: ReadonlySet<string>,
  latestAuthorBotSlug?: string | undefined,
): TimelineWorkingRows {
  const active = (activity?.items ?? []).filter(
    (item) =>
      (item.state === 'working' ||
        (item.state === 'thinking' && item.personaBotId !== latestAuthorBotSlug)) &&
      attentionCount(item.attention) === 0 &&
      !streamingBotSlugs.has(item.personaBotId),
  );
  return {
    items: active.slice(0, MAX_WORKING_ROWS),
    more: Math.max(0, active.length - MAX_WORKING_ROWS),
  };
}

function rowActivity(
  activity: PersonaBotFacepileItem['activity'],
): PersonaBotFacepileItem['activity'] {
  if (activity === undefined) return undefined;
  const { sources: _sources, ...rest } = activity;
  return { ...rest, activeToolCount: 1 };
}

export function timelineWorkingRowsCover(
  activity: ChannelComposerActivity | undefined,
  rows: TimelineWorkingRows,
  streamingBotSlugs: ReadonlySet<string>,
): boolean {
  const shown = new Set(rows.items.map((item) => item.personaBotId));
  return (
    activity !== undefined &&
    activity.items.length > 0 &&
    activity.items.every(
      (item) =>
        (shown.has(item.personaBotId) || streamingBotSlugs.has(item.personaBotId)) &&
        (item.attention?.informationalCount ?? 0) === 0,
    )
  );
}

export interface TimelineWorkingStop {
  targets: ReadonlySet<string>;
  stopping: boolean;
  onStop(slug: string): void;
}

function TimelineWorkingCard({
  item,
  stop,
  t,
}: {
  item: PersonaBotFacepileItem;
  stop: TimelineWorkingStop | undefined;
  t: BotHarnessTranslate;
}): ReactElement {
  const [open, setOpen] = useState(false);
  const sessions = item.sessions ?? [];
  const expandable = sessions.length > 0;
  const stoppable = stop?.targets.has(item.personaBotId) === true;
  return (
    <div
      className="bh-timeline-working-row"
      data-bot-slug={item.personaBotId}
      data-open={open ? 'true' : undefined}
    >
      <div className="bh-timeline-working-head">
        <button
          type="button"
          className="bh-timeline-working-toggle"
          aria-expanded={expandable ? open : undefined}
          disabled={!expandable}
          onClick={(event) => {
            const card = event.currentTarget.closest('.bh-timeline-working-row');
            setOpen((current) => !current);
            requestAnimationFrame(() => card?.scrollIntoView({ block: 'nearest' }));
          }}
        >
          <PersonaBotAvatar
            t={t}
            personaBotId={item.personaBotId}
            name={item.name}
            src={item.src}
            appearance={item.appearance}
            avatarSeed={item.avatarSeed}
            state={item.state}
            activity={item.activity}
            size={32}
            indicator={false}
          />
          <span className="bh-timeline-working-text">
            <span className="bh-timeline-working-name">{item.name}</span>
            <span className="bh-timeline-working-summary">
              {personaBotActivitySummary(item.state ?? 'idle', rowActivity(item.activity), t)}
              <span className="bh-timeline-working-ellipsis" aria-hidden="true">
                <i>.</i>
                <i>.</i>
                <i>.</i>
              </span>
            </span>
          </span>
          {expandable ? (
            <IconChevronDownOutlineRegular className="bh-timeline-working-chevron" size={14} />
          ) : null}
        </button>
        {stoppable ? (
          <button
            type="button"
            className="bh-timeline-working-stop"
            aria-label={
              stop?.stopping === true
                ? t('composer.stopping')
                : t('composer.stopBot', { name: item.name })
            }
            aria-busy={stop?.stopping === true || undefined}
            disabled={stop?.stopping === true}
            onClick={() => stop?.onStop(item.personaBotId)}
          >
            <IconStopFillRegular size={14} />
          </button>
        ) : null}
      </div>
      {open && expandable ? (
        <ul className="bh-timeline-working-sessions">
          {sessions.map((session) => {
            const roleLabel = t(`activity.source.${session.role}`);
            const label =
              session.role === 'orchestrator'
                ? roleLabel
                : (session.name ?? t('activity.session.untitled'));
            const latest = sessionLatestSummary(session, t);
            return (
              <li key={session.id}>
                <SessionRoleIcon role={session.role} label={roleLabel} />
                <span className="bh-timeline-working-session-label" title={label}>
                  {label}
                </span>
                <span className="bh-timeline-working-session-latest" title={latest}>
                  {latest}
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

export function TimelineWorkingRowsView({
  rows,
  stop,
  t,
}: {
  rows: TimelineWorkingRows;
  stop?: TimelineWorkingStop | undefined;
  t: BotHarnessTranslate;
}): ReactElement | null {
  if (rows.items.length === 0) return null;
  return (
    <div className="bh-timeline-working">
      {rows.items.map((item) => (
        <TimelineWorkingCard key={item.personaBotId} item={item} stop={stop} t={t} />
      ))}
      {rows.more > 0 ? (
        <div className="bh-timeline-working-more">
          {t('main.activity.more', { count: rows.more })}
        </div>
      ) : null}
    </div>
  );
}

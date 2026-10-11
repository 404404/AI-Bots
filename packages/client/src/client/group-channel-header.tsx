import type { ReactElement } from 'react';
import { Tooltip } from '@deepseek-ai/dsh-client-ui-primitives';
import { GroupChannelIcon } from './group-avatar-stack.js';
import type { BotHarnessTranslate } from './locale.js';
import type { BotSummary, ChannelSummary } from './store.js';

export function GroupChannelHeader({
  channel,
  title,
  bots,
  expanded,
  t,
  onOpenActivity,
  onToggleProfile,
}: {
  channel: ChannelSummary;
  title: string;
  bots: ReadonlyMap<string, BotSummary>;
  expanded: boolean;
  t: BotHarnessTranslate;
  onOpenActivity(): void;
  onToggleProfile(): void;
}): ReactElement {
  return (
    <span className="bh-channel-island bh-group-channel-header">
      <Tooltip label={t('groupProfile.liveActivity')} side="bottom" portal delayMs={350}>
        <button
          type="button"
          className="bh-group-channel-avatar"
          aria-label={t('groupProfile.liveActivity')}
          aria-haspopup="dialog"
          aria-expanded={expanded}
          onClick={onOpenActivity}
        >
          <GroupChannelIcon
            channel={channel}
            bots={bots}
            className="bh-channel-slot"
            groupClassName="bh-group-channel-slot"
            size={34}
            hashSize={18}
            t={t}
          />
        </button>
      </Tooltip>
      <button
        type="button"
        className="bh-group-channel-name"
        aria-haspopup="dialog"
        aria-expanded={expanded}
        aria-label={t('groupProfile.openAvatar', { name: channel.name })}
        onClick={onToggleProfile}
      >
        <span className="bh-title">{title}</span>
      </button>
    </span>
  );
}

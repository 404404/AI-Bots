import type { ReactElement } from 'react';
import { PersonaBotAvatar } from './avatar.js';
import type { BotHarnessTranslate } from './locale.js';
import type { BotSummary, ChannelMessage, ChannelSummary } from './store.js';

/** Where a post or notice recorded elsewhere lives, as the Human knows that Channel. */
export function elsewhereLabel(
  channelId: string,
  channels: readonly ChannelSummary[],
  bots: readonly BotSummary[],
  t: BotHarnessTranslate,
): string {
  const channel = channels.find((candidate) => candidate.id === channelId);
  if (channel === undefined) return t('dmTrace.place.unavailable');
  if (channel.type === 'group') return `#${channel.name}`;
  const names = channel.members.map(
    (slug) => bots.find((bot) => bot.slug === slug)?.displayName ?? slug,
  );
  return t('dmTrace.place.botDm', { names: names.join(' ↔ ') });
}

/**
 * One DM line for consecutive posts a PersonaBot made in another Channel. It names the
 * place and shows the latest post's excerpt; clicking opens that post where it lives.
 */
export function BotChannelPostLine({
  posts,
  channels,
  bots,
  t,
  onOpen,
}: {
  posts: readonly ChannelMessage[];
  channels: readonly ChannelSummary[];
  bots: readonly BotSummary[];
  t: BotHarnessTranslate;
  onOpen(channelId: string, messageId: string): void;
}): ReactElement {
  const latest = posts.at(-1)!;
  const post = latest.botChannelPost!;
  const slug = latest.author.kind === 'bot' ? latest.author.slug : '';
  const bot = bots.find((candidate) => candidate.slug === slug);
  const name = bot?.displayName ?? slug;
  const place = elsewhereLabel(post.channelId, channels, bots, t);
  const verb =
    posts.length === 1
      ? t('dmTrace.posted', { place })
      : t('dmTrace.postedMany', { place, count: posts.length });
  const preview = latest.botChannelPostPreview;
  return (
    <div className="bh-memory-commit-row">
      <button
        type="button"
        className="bh-memory-commit-line bh-dm-trace-line"
        data-message-id={latest.id}
        title={preview ?? t('dmTrace.unavailable')}
        onClick={() => onOpen(post.channelId, post.messageId)}
      >
        <span className="bh-bot-dm-action-bot">
          <span className="bh-bot-dm-action-avatar" aria-hidden="true">
            <PersonaBotAvatar
              t={t}
              personaBotId={slug}
              name={name}
              src={bot?.avatar}
              appearance={bot?.appearance}
              avatarSeed={bot?.avatarSeed}
              size={16}
              indicator={false}
              still
            />
          </span>
          <span className="bh-bot-dm-action-name">{name}</span>
        </span>
        <span>{verb}</span>
        <span className="bh-memory-commit-subject">
          {preview === null || preview === undefined ? t('dmTrace.unavailable') : preview}
        </span>
      </button>
    </div>
  );
}

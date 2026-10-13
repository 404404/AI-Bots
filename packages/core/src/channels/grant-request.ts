import type { ChannelMessage, ChannelRecord } from './channel.js';
import { ChannelReplyTargetError } from './store.js';

export function isGrantRequestResolved(
  messages: readonly ChannelMessage[],
  requestMessageId: string,
): boolean {
  return messages.some(
    (message) =>
      message.author.kind === 'human' &&
      message.replyTo === requestMessageId &&
      message.grantRequestResolution?.requestMessageId === requestMessageId,
  );
}

export function assertGrantRequestReply(
  channel: ChannelRecord,
  message: ChannelMessage,
  messages: readonly ChannelMessage[],
): void {
  const resolution = message.grantRequestResolution;
  if (resolution === undefined) return;
  const request = messages.find((entry) => entry.id === resolution.requestMessageId);
  if (
    message.author.kind !== 'human' ||
    message.replyTo !== resolution.requestMessageId ||
    request?.grantRequest !== true ||
    request.author.kind !== 'bot' ||
    (channel.type === 'dm'
      ? channel.botSlug !== request.author.slug
      : !channel.members.includes(request.author.slug)) ||
    isGrantRequestResolved(messages, request.id)
  )
    throw new ChannelReplyTargetError();
}

export function grantRequester(
  message: ChannelMessage,
  messages: readonly ChannelMessage[],
): string | undefined {
  const resolution = message.grantRequestResolution;
  if (resolution === undefined) return undefined;
  const author = messages.find((entry) => entry.id === resolution.requestMessageId)?.author;
  return author?.kind === 'bot' ? author.slug : undefined;
}

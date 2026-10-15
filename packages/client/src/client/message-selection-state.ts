import type { ChannelMessage } from './store.js';

export const MESSAGE_SELECTION_LIMIT = 200;

export interface MessageSelection {
  selected: ReadonlySet<string>;
  active: boolean;
  begin(message: ChannelMessage): void;
  toggle(message: ChannelMessage): void;
}

export function selectableMessage(message: ChannelMessage): boolean {
  return message.pending !== true && message.streaming !== true && message.failed === undefined;
}

export function toggleSelection(
  current: readonly string[],
  message: ChannelMessage,
): readonly string[] {
  if (!selectableMessage(message)) return current;
  if (current.includes(message.id)) return current.filter((id) => id !== message.id);
  if (current.length >= MESSAGE_SELECTION_LIMIT) return current;
  return [...current, message.id];
}

export function selectionRange(
  ids: readonly string[],
  messages: readonly ChannelMessage[],
): { fromMessageId: string; toMessageId?: string; messageIds: string[] } | undefined {
  const picked = messages
    .filter((message) => ids.includes(message.id))
    .sort((left, right) => Date.parse(left.at) - Date.parse(right.at));
  const first = picked[0];
  const last = picked[picked.length - 1];
  if (first === undefined || last === undefined) return undefined;
  return {
    fromMessageId: first.id,
    ...(picked.length > 1 ? { toMessageId: last.id } : {}),
    messageIds: picked.map((message) => message.id),
  };
}

function stamp(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function conversationText(
  ids: readonly string[],
  messages: readonly ChannelMessage[],
  options: { title: string; author(message: ChannelMessage): string; attachment: string },
): string {
  const blocks = messages
    .filter((message) => ids.includes(message.id))
    .sort((left, right) => Date.parse(left.at) - Date.parse(right.at))
    .flatMap((message) => {
      const lines = [
        ...(message.body.trim().length > 0 ? [message.body.trim()] : []),
        ...(message.attachments ?? []).map((ref) => `[${options.attachment}: ${ref.name}]`),
      ];
      return lines.length === 0
        ? []
        : [`${options.author(message)}  ${stamp(message.at)}\n${lines.join('\n')}`];
    });
  return [options.title, ...blocks].join('\n\n') + '\n';
}

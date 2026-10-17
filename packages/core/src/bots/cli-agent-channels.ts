import type { AgentManagementInvocation } from './cli-agent-management.js';
import { CliLiveError } from './cli-live-error.js';

export const TOB_AGENT_CHANNEL_COMMAND_USAGE: Readonly<Record<string, string>> = {
  channels:
    'deepseekbot channels [--limit <1..100>] [--cursor <last-channel-id>]; bounded Channel metadata, not messages',
  channel:
    'deepseekbot channel <group-channel-id>; returns channelFingerprint for a reviewed invitation',
  'group-create':
    'deepseekbot group-create <name> --operation-key <stable-key> [--member <bot-slug> ...]; explicit initial members join directly, matching Human group creation',
  'group-invite':
    'deepseekbot group-invite <channel-id> --bot <bot-slug> --operation-key <stable-key> --expected-channel <observed-fingerprint>; preserves the existing invitation acceptance policy',
};

const OPTIONS: Readonly<Record<string, readonly string[]>> = {
  channels: ['limit', 'cursor'],
  channel: [],
  'group-create': ['member', 'operation-key'],
  'group-invite': ['bot', 'operation-key', 'expected-channel'],
};
function usage(message: string): never {
  throw new CliLiveError('usage', message);
}
function text(value: unknown, label: string): string {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.length > 512 ||
    [...value].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)
  )
    usage(`${label} requires nonempty text of at most 512 characters without control characters.`);
  return value.trim();
}
function operationKey(value: unknown): string {
  const key = text(value, '--operation-key');
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/u.test(key))
    usage(
      '--operation-key requires 8–128 letters, digits, dots, underscores, colons or hyphens, beginning with a letter or digit.',
    );
  return key;
}
export function parseAgentChannels(
  command: string,
  rest: string[],
  values: Record<string, unknown>,
): AgentManagementInvocation | undefined {
  if (!Object.hasOwn(OPTIONS, command)) return undefined;
  const allowed = new Set(['compact', 'help', 'timeout', ...OPTIONS[command]!]);
  if (Object.entries(values).some(([key, value]) => value !== undefined && !allowed.has(key)))
    throw new CliLiveError(
      'agent-scope-denied',
      'This option is not available for the scoped Channel operation.',
    );
  if (rest.length !== (command === 'channels' ? 0 : 1))
    usage('This Channel operation has missing or extra positional arguments.');
  if (command === 'channels') {
    const args: Record<string, unknown> = {};
    if (values.limit !== undefined) {
      if (typeof values.limit !== 'string' || !/^\d+$/u.test(values.limit))
        usage('--limit must be an integer from 1 to 100.');
      const limit = Number(values.limit);
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100)
        usage('--limit must be an integer from 1 to 100.');
      args.limit = limit;
    }
    if (values.cursor !== undefined) args.cursor = text(values.cursor, '--cursor');
    return { command, args, write: false };
  }
  const target = text(rest[0], command === 'group-create' ? 'Group name' : 'Channel ID');
  if (command === 'channel') return { command, args: { channelId: target }, write: false };
  const key = operationKey(values['operation-key']);
  if (command === 'group-create') {
    if (
      values.member !== undefined &&
      (!Array.isArray(values.member) || values.member.length > 100)
    )
      usage('--member must be a list of at most 100 Bot IDs.');
    const members = ((values.member ?? []) as unknown[]).map((member) => text(member, '--member'));
    if (new Set(members).size !== members.length)
      usage('--member must not contain duplicate Bot IDs.');
    return { command, args: { name: target, members, operationKey: key }, write: true };
  }
  const expectedChannel = text(values['expected-channel'], '--expected-channel');
  if (!/^[a-f0-9]{64}$/u.test(expectedChannel))
    usage('--expected-channel must be the observed Channel fingerprint.');
  return {
    command,
    args: {
      channelId: target,
      botSlug: text(values.bot, '--bot'),
      expectedChannel,
      operationKey: key,
    },
    write: true,
  };
}

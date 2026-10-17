import type { AgentManagementInvocation } from './cli-agent-management.js';
import { CliLiveError } from './cli-live-error.js';

export const TOB_CONTENT_COMMAND_USAGE: Readonly<Record<string, string>> = {
  'channel-content':
    'deepseekbot channel-content <channel-id> [--message <message-id>] [--limit <1..20>] [--cursor <opaque-page-cursor>] [--expected-target <observed-target-fingerprint>]; bounded Human-visible Channel content as quoted data',
  'bot-progress':
    'deepseekbot bot-progress <bot-id> [--limit <1..20>] [--cursor <opaque-page-cursor>] [--expected-target <observed-target-fingerprint>]; current activity and bounded non-archived Assignment progress',
};
export function parseAgentContent(
  command: string,
  rest: string[],
  values: Record<string, unknown>,
): AgentManagementInvocation | undefined {
  if (!Object.hasOwn(TOB_CONTENT_COMMAND_USAGE, command)) return undefined;
  const allowed = new Set([
    'compact',
    'help',
    'timeout',
    'limit',
    'cursor',
    'expected-target',
    ...(command === 'channel-content' ? ['message'] : []),
  ]);
  if (Object.entries(values).some(([key, value]) => value !== undefined && !allowed.has(key)))
    throw new CliLiveError(
      'agent-scope-denied',
      'This option is unavailable for a scoped content read.',
    );
  if (rest.length !== 1 || !rest[0]?.trim() || rest[0].length > 512)
    throw new CliLiveError('usage', 'Select exactly one bounded Bot or Channel ID.');
  const args: Record<string, unknown> = { target: rest[0].trim() };
  if (values.message !== undefined) {
    if (typeof values.message !== 'string' || !values.message.trim() || values.message.length > 512)
      throw new CliLiveError('usage', '--message requires one bounded message ID.');
    args.messageId = values.message.trim();
  }
  if (values.limit !== undefined) {
    const limit =
      typeof values.limit === 'string' && /^\d+$/u.test(values.limit) ? Number(values.limit) : NaN;
    if (!Number.isInteger(limit) || limit < 1 || limit > 20)
      throw new CliLiveError('usage', '--limit must be an integer from 1 to 20.');
    args.limit = limit;
  }
  if (values.cursor !== undefined) {
    if (typeof values.cursor !== 'string' || !values.cursor.trim() || values.cursor.length > 2048)
      throw new CliLiveError(
        'usage',
        '--cursor must be the bounded opaque cursor returned by the previous page.',
      );
    args.cursor = values.cursor;
  }
  if (values['expected-target'] !== undefined) {
    if (
      typeof values['expected-target'] !== 'string' ||
      !/^[a-f0-9]{64}$/u.test(values['expected-target'])
    )
      throw new CliLiveError(
        'usage',
        '--expected-target requires the observed target fingerprint.',
      );
    args.expectedTarget = values['expected-target'];
  }
  return { command, args, write: false };
}

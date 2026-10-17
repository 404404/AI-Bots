import type { AgentManagementInvocation } from './cli-agent-management.js';
import { CliLiveError } from './cli-live-error.js';

export const TOB_MEMORY_COMMAND_USAGE: Readonly<Record<string, string>> = {
  'assignment-memory-create':
    'deepseekbot assignment-memory-create <purpose> --grant <Tob-owned-workspace-grant-id> --member <target-bot-id> [--member <target-bot-id> ...] --operation-key <stable-key> [--key <continuity-key>]',
  'assignment-memory-revoke': 'deepseekbot assignment-memory-revoke <assignment-session-id>',
  'memory-snapshot':
    'deepseekbot memory-snapshot <target-bot-id> [--sha <revision>] [--offset <n>] [--limit <1..100>]; obtain an immutable revision before reading files',
  'memory-file':
    'deepseekbot memory-file <target-bot-id> --sha <revision> --path <file> [--offset <character-offset>] [--limit <1..32000>]',
  'memory-history':
    'deepseekbot memory-history <target-bot-id> --sha <revision> [--offset <n>] [--limit <1..100>]',
  'memory-diff':
    'deepseekbot memory-diff <target-bot-id> --sha <revision> [--offset <character-offset>] [--limit <1..32000>]',
};
const OPTIONS: Readonly<Record<string, string[]>> = {
  'assignment-memory-create': ['grant', 'member', 'operation-key', 'key'],
  'assignment-memory-revoke': [],
  'memory-snapshot': ['sha', 'offset', 'limit'],
  'memory-file': ['sha', 'path', 'offset', 'limit'],
  'memory-history': ['sha', 'offset', 'limit'],
  'memory-diff': ['sha', 'offset', 'limit'],
};
function text(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 8000)
    throw new CliLiveError('usage', 'A nonempty bounded value is required.');
  return value.trim();
}
export function parseAgentMemory(
  command: string,
  rest: string[],
  values: Record<string, unknown>,
): AgentManagementInvocation | undefined {
  if (!Object.hasOwn(OPTIONS, command)) return undefined;
  const allowed = new Set(['compact', 'help', 'timeout', ...OPTIONS[command]!]);
  if (Object.entries(values).some(([key, value]) => value !== undefined && !allowed.has(key)))
    throw new CliLiveError(
      'agent-scope-denied',
      'This option is unavailable in the delegated Memory scope.',
    );
  if (rest.length !== 1)
    throw new CliLiveError('usage', 'This operation requires exactly one target or purpose.');
  const target = text(rest[0]);
  if (command === 'assignment-memory-create') {
    if (!Array.isArray(values.member) || values.member.length < 1 || values.member.length > 10)
      throw new CliLiveError('usage', 'Select one to ten target Bots with --member.');
    const targets = values.member.map(text);
    if (new Set(targets).size !== targets.length)
      throw new CliLiveError('usage', 'Target Bots must be unique.');
    return {
      command,
      args: {
        purpose: target,
        grantId: text(values.grant),
        targets,
        operationKey: text(values['operation-key']),
        ...(values.key === undefined ? {} : { key: text(values.key) }),
      },
      write: true,
    };
  }
  if (command === 'assignment-memory-revoke')
    return { command, args: { sessionId: target }, write: true };
  const args: Record<string, unknown> = { slug: target };
  if (values.sha !== undefined) {
    if (typeof values.sha !== 'string' || !/^[0-9a-f]{40}$/u.test(values.sha))
      throw new CliLiveError('usage', 'Use an exact 40-character Memory revision.');
    args.sha = values.sha;
  } else if (command !== 'memory-snapshot')
    throw new CliLiveError('usage', 'Read a snapshot and pass its explicit --sha.');
  if (command === 'memory-file') args.path = text(values.path);
  for (const key of ['offset', 'limit'])
    if (values[key] !== undefined) {
      if (typeof values[key] !== 'string' || !/^\d+$/u.test(values[key]))
        throw new CliLiveError('usage', 'Pagination must use nonnegative integers.');
      args[key] = Number(values[key]);
    }
  return { command, args, write: false };
}

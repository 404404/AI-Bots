import type { AgentManagementInvocation } from './cli-agent-management.js';
import type { BotCreateCliIo } from './bot-create-cli.js';
import { CliLiveError } from './cli-live-error.js';

export interface TobPolicyCommand {
  options: readonly string[];
  count: number;
  write: boolean;
  usage: string;
}

const spec = (
  options: string[],
  count: number,
  write: boolean,
  usage: string,
): TobPolicyCommand => ({
  options,
  count,
  write,
  usage: `deepseekbot ${usage}${write ? ' --expected-state <observed-policy-fingerprint>; always requires Human review' : '; returns stateFingerprint for reviewed writes'}`,
});

export const TOB_POLICY_COMMANDS: Readonly<Record<string, TobPolicyCommand>> = {
  'workspace-options': spec([], 0, false, 'workspace-options'),
  grants: spec([], 1, false, 'grants <bot>'),
  'grant-create': spec(['workspace'], 1, true, 'grant-create <bot> --workspace <workspace-id>'),
  'grant-revoke': spec(
    ['grant', 'confirm'],
    1,
    true,
    'grant-revoke <bot> --grant <grant-id> --confirm',
  ),
  'grant-write-set': spec(
    ['grant', 'enabled', 'disabled'],
    1,
    true,
    'grant-write-set <bot> --grant <grant-id> (--enabled | --disabled)',
  ),
  access: spec([], 1, false, 'access <bot>'),
  'access-set': spec(
    ['mode', 'scope', 'acknowledge-risk'],
    1,
    true,
    'access-set <bot> --mode <workspace-write|danger-full-access> [--scope <chat|assignments>] [--acknowledge-risk]',
  ),
  'browser-access-set': spec(
    ['enabled', 'disabled'],
    1,
    true,
    'browser-access-set <bot> (--enabled | --disabled)',
  ),
  'computer-access-set': spec(
    ['enabled', 'disabled'],
    1,
    true,
    'computer-access-set <bot> (--enabled | --disabled)',
  ),
  'tool-approval-rules': spec([], 1, false, 'tool-approval-rules <bot>'),
  'tool-approval-rule-revoke': spec(
    ['rule', 'confirm'],
    1,
    true,
    'tool-approval-rule-revoke <bot> --rule <rule-id> --confirm',
  ),
  'approval-templates': spec(['bot'], 0, false, 'approval-templates [--bot <bot>]'),
  'approval-template-show': spec([], 1, false, 'approval-template-show <name>'),
  'approval-template-set': spec([], 2, true, 'approval-template-set <bot> <name|off>'),
  'approval-template': spec(
    ['from', 'text-stdin', 'confirm'],
    -1,
    false,
    'approval-template <list|show|create|edit|delete> [name] [--from <name> | --text-stdin] [--confirm]',
  ),
  'approval-reviewer-model': spec([], 0, false, 'approval-reviewer-model'),
  'approval-reviewer-model-set': spec(
    ['effort'],
    1,
    true,
    'approval-reviewer-model-set <provider/model|bot> [--effort <effort>]',
  ),
  'messaging-defaults': spec([], 1, false, 'messaging-defaults <platform>'),
  'messaging-defaults-set': spec(
    ['input-stdin'],
    1,
    true,
    'messaging-defaults-set <platform> --input-stdin',
  ),
  'messaging-grants': spec([], 1, false, 'messaging-grants <bot>'),
  'messaging-targets': spec([], 1, false, 'messaging-targets <app-ref>'),
  'messaging-authorize': spec(
    ['app', 'target'],
    1,
    true,
    'messaging-authorize <bot> --app <ref> --target <ref>',
  ),
  'messaging-revoke': spec(
    ['grant', 'confirm'],
    1,
    true,
    'messaging-revoke <bot> --grant <id> --confirm',
  ),
  'messaging-receive': spec(
    ['grant', 'enabled', 'disabled'],
    1,
    true,
    'messaging-receive <bot> --grant <id> (--enabled | --disabled)',
  ),
  'messaging-channel-target': spec(
    ['grant', 'channel'],
    1,
    true,
    'messaging-channel-target <bot> --grant <id> --channel <id|none>',
  ),
  'messaging-group-policy': spec(
    ['grant', 'input-stdin'],
    1,
    true,
    'messaging-group-policy <bot> --grant <id> --input-stdin',
  ),
  'messaging-thread-policy': spec(
    ['source', 'input-stdin'],
    1,
    true,
    'messaging-thread-policy <bot> --source <id> --input-stdin',
  ),
  'messaging-conversation': spec(
    ['input-stdin', 'confirm'],
    1,
    true,
    'messaging-conversation <bot> --input-stdin [--confirm]',
  ),
  'messaging-post-limit': spec(
    ['binding', 'limit'],
    1,
    true,
    'messaging-post-limit <bot> --binding <id> --limit <1..10000|none>',
  ),
  'sender-access': spec(
    ['input-stdin', 'confirm'],
    1,
    true,
    'sender-access <bot> --input-stdin [--confirm]',
  ),
  'channel-bridges': spec([], 1, false, 'channel-bridges <channel>'),
  'channel-bridge': spec(
    ['input-stdin', 'confirm'],
    1,
    true,
    'channel-bridge <channel> --input-stdin [--confirm]',
  ),
  'approval-routes': spec([], 1, false, 'approval-routes <bot>'),
  'approval-route': spec(['pairing'], 1, true, 'approval-route <bot> --pairing <id|none>'),
  'failure-alerts': spec([], 1, false, 'failure-alerts <bot>'),
  'failure-alerts-set': spec(
    ['enabled', 'disabled'],
    1,
    true,
    'failure-alerts-set <bot> (--enabled | --disabled)',
  ),
  'pairing-list': spec([], 1, false, 'pairing-list <bot>'),
  'pairing-review': spec(
    ['decision', 'role', 'capability', 'confirm'],
    2,
    true,
    'pairing-review <bot> <pairing-id> --decision <approve|reject|revoke> [--role <id> | --capability <capability> ...] [--confirm]',
  ),
};

export const TOB_AGENT_POLICY_COMMAND_USAGE = Object.fromEntries(
  Object.entries(TOB_POLICY_COMMANDS).map(([command, entry]) => [command, entry.usage]),
);

export async function parseAgentPolicies(
  command: string,
  rest: string[],
  values: Record<string, unknown>,
  io: Pick<BotCreateCliIo, 'readStdin'>,
): Promise<AgentManagementInvocation | undefined> {
  const entry = TOB_POLICY_COMMANDS[command];
  if (!entry) return undefined;
  const fail = (): never => {
    throw new CliLiveError(
      'invalid-input',
      'Use capabilities for this scoped policy command and its exact inputs.',
    );
  };
  if (
    rest.some(
      (value) =>
        typeof value !== 'string' ||
        !value.trim() ||
        value !== value.trim() ||
        value.length > 512 ||
        /[\u0000-\u001f\u007f]/u.test(value),
    )
  )
    fail();
  let write = entry.write;
  if (command === 'approval-template') {
    if (
      !['list', 'show', 'create', 'edit', 'delete'].includes(rest[0] ?? '') ||
      rest.length !== (rest[0] === 'list' ? 1 : 2)
    )
      fail();
    write = ['create', 'edit', 'delete'].includes(rest[0]!);
  } else if (rest.length !== entry.count) fail();
  const allowed = new Set([
    'compact',
    'help',
    'timeout',
    ...entry.options,
    ...(write ? ['expected-state'] : []),
  ]);
  const options: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) continue;
    if (!allowed.has(key))
      throw new CliLiveError(
        'agent-scope-denied',
        'This option is outside the scoped policy command.',
      );
    if (entry.options.includes(key)) {
      const boolean = [
        'enabled',
        'disabled',
        'confirm',
        'acknowledge-risk',
        'input-stdin',
        'text-stdin',
      ].includes(key);
      const multiple = ['role', 'capability'].includes(key);
      if (
        boolean
          ? typeof value !== 'boolean'
          : multiple
            ? !Array.isArray(value) || !value.every((item) => typeof item === 'string')
            : typeof value !== 'string'
      )
        fail();
      options[key] = value;
    }
  }
  if (command === 'approval-template' && rest[0] === 'delete' && options.confirm !== true)
    throw new CliLiveError(
      'confirmation-required',
      'Deleting an Approval Template requires --confirm.',
    );
  const expectedState = values['expected-state'];
  if (write && (typeof expectedState !== 'string' || !/^[a-f0-9]{64}$/u.test(expectedState)))
    fail();
  const stdin = options['input-stdin'] === true || options['text-stdin'] === true;
  const input = stdin ? ((await io.readStdin?.()) ?? '') : undefined;
  if (input !== undefined && Buffer.byteLength(input) > 64 * 1024) fail();
  return {
    command,
    write,
    args: {
      rest: [...rest],
      options,
      ...(input === undefined ? {} : { input }),
      ...(write ? { expectedState } : {}),
    },
  };
}

import type { AgentManagementInvocation } from './cli-agent-management.js';
import { CliLiveError } from './cli-live-error.js';

export const TOB_IM_SETUP_USAGE: Readonly<Record<string, string>> = {
  'im-apps':
    'deepseekbot im-apps; qualified setup availability, owned opaque receipts and stateFingerprint',
  'im-authorize':
    'deepseekbot im-authorize <feishu|weixin> --expected-state <im-apps stateFingerprint>; new Human review; Human continues this exact attempt in Applications settings',
  'pairing-status':
    'deepseekbot pairing-status <owned-receipt-id>; one status read, no QR/token/credentials',
  'im-cancel':
    'deepseekbot im-cancel <owned-receipt-id> --expected-state <pairing-status stateFingerprint>; fresh Human review; never revokes a ready account',
};

export function parseAgentImSetup(
  command: string,
  rest: string[],
  values: Record<string, unknown>,
): AgentManagementInvocation | undefined {
  if (!Object.hasOwn(TOB_IM_SETUP_USAGE, command)) return undefined;
  const write = command === 'im-authorize' || command === 'im-cancel';
  const allowed = ['compact', 'help', 'timeout', ...(write ? ['expected-state'] : [])];
  if (Object.entries(values).some(([key, value]) => value !== undefined && !allowed.includes(key)))
    throw new CliLiveError(
      'agent-scope-denied',
      'This setup operation accepts no secret, identity, Host or arbitrary method inputs.',
    );
  if (
    rest.length !== (command === 'im-apps' ? 0 : 1) ||
    (rest[0] !== undefined && !/^[A-Za-z0-9_-]{1,128}$/u.test(rest[0]))
  )
    throw new CliLiveError(
      'invalid-input',
      'Use the exact platform or owned receipt from capabilities.',
    );
  if (command === 'im-authorize' && !['feishu', 'weixin'].includes(rest[0]!))
    throw new CliLiveError('invalid-input', 'Choose feishu or weixin.');
  const expectedState = values['expected-state'];
  if (write && (typeof expectedState !== 'string' || !/^[a-f0-9]{64}$/u.test(expectedState)))
    throw new CliLiveError(
      'invalid-input',
      'Read the current setup state before proposing a change.',
    );
  return {
    command,
    write,
    args: {
      ...(command === 'im-apps' ? {} : { target: rest[0] }),
      ...(write ? { expectedState } : {}),
    },
  };
}

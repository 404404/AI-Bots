import type { AgentManagementInvocation } from './cli-agent-management.js';
import type { BotCreateCliIo } from './bot-create-cli.js';
import { CliLiveError } from './cli-live-error.js';

export const CLIENT_PREFERENCE_USAGE: Readonly<Record<string, string>> = {
  'client-layout':
    'deepseekbot client-layout <client-id> --generation <generation>; discover live workspace, Channel, stable panel ids and stateFingerprint. Tob may replace <client-id> --generation <generation> with current; omit --generation with current.',
  'client-layout-set':
    'deepseekbot client-layout-set <client-id> --generation <generation> --scope browser-origin --expected-state <fingerprint> --patch-stdin; one layout edit, with explicit channelId for Channel children. Tob may replace <client-id> --generation <generation> with current; omit --generation with current.',
  'client-shortcuts':
    'deepseekbot client-shortcuts <client-id> --generation <generation>; discover stable command ids, effective bindings, native revision and current platform profile. Tob may replace <client-id> --generation <generation> with current; omit --generation with current.',
  'client-shortcuts-set':
    'deepseekbot client-shortcuts-set <client-id> --generation <generation> --scope client-profile --expected-state <fingerprint> --patch-stdin; {profile,id,type:set|disable|reset,binding?:{code,secondCode?,modifiers}}; no reset-all. Tob may replace <client-id> --generation <generation> with current; omit --generation with current.',
  'human-name': 'deepseekbot human-name; read default Human display name and stateFingerprint',
  'client-targets':
    'deepseekbot client-targets; discover live Client ids and generations; never selects a sole client implicitly',
  'client-preferences':
    'deepseekbot client-preferences <client-id> --generation <generation>; current is available only to Tob from its canonical Human DM source. Tob may replace <client-id> --generation <generation> with current; omit --generation with current.',
  'client-preferences-set':
    'deepseekbot client-preferences-set <client-id> --generation <generation> --scope browser-origin --expected-state <observed-fingerprint> --patch-stdin; one field: notifications:boolean or notificationPermission:"request"; theme/locale require explicit Host settings commands. Tob may replace <client-id> --generation <generation> with current; omit --generation with current.',
};
export const CLIENT_PREFERENCE_COMMANDS = Object.entries(CLIENT_PREFERENCE_USAGE).map(
  ([command, description]) => ({ command, description }),
);
export const CLIENT_PREFERENCE_OPTIONS = { generation: { type: 'string' } } as const;
export async function parseClientPreferences(
  command: string,
  rest: string[],
  values: Record<string, unknown>,
  io: BotCreateCliIo,
  agent = false,
): Promise<AgentManagementInvocation | undefined> {
  if (!Object.hasOwn(CLIENT_PREFERENCE_USAGE, command)) return undefined;
  if (command === 'human-name') {
    const allowed = new Set([
      'help',
      'compact',
      'timeout',
      ...(agent ? [] : ['host', 'token-file']),
    ]);
    if (Object.entries(values).some(([key, value]) => value !== undefined && !allowed.has(key)))
      throw new CliLiveError('agent-scope-denied', 'Unsupported Human preference option.');
    if (rest.length) throw new CliLiveError('usage', 'human-name takes no target.');
    return { command, args: {}, write: false };
  }
  const discovery = command === 'client-targets';
  const write = command.endsWith('-set');
  const allowed = new Set([
    'help',
    'compact',
    'timeout',
    ...(agent ? [] : ['host', 'token-file']),
    ...(discovery ? [] : ['generation']),
    ...(write ? ['scope', 'expected-state', 'patch-stdin'] : []),
  ]);
  if (Object.entries(values).some(([key, value]) => value !== undefined && !allowed.has(key)))
    throw new CliLiveError(
      agent ? 'agent-scope-denied' : 'usage',
      'Unsupported Client preference option.',
    );
  if (rest.length !== (discovery ? 0 : 1))
    throw new CliLiveError(
      'usage',
      'Choose exactly one explicit Client target, or use client-targets without a target.',
    );
  const args: Record<string, unknown> = {};
  if (!discovery) {
    const clientId = rest[0]!;
    if (clientId === 'current') {
      if (!agent || values.generation !== undefined)
        throw new CliLiveError(
          'current-client-unavailable',
          'current is derived from the originating Tob request; do not supply a generation.',
        );
      args.current = true;
    } else {
      if (
        !/^[a-zA-Z0-9-]{8,80}$/u.test(clientId) ||
        typeof values.generation !== 'string' ||
        !/^[a-zA-Z0-9-]{8,80}$/u.test(values.generation)
      )
        throw new CliLiveError(
          'client-target-required',
          'Use a discovered Client id and its exact generation.',
        );
      args.target = { clientId, generation: values.generation };
    }
  }
  if (write) {
    if (values.scope !== (command === 'client-shortcuts-set' ? 'client-profile' : 'browser-origin'))
      throw new CliLiveError(
        'client-scope-mismatch',
        'Use the selected owner scope: --scope client-profile for shortcuts; --scope browser-origin for notifications or layout.',
      );
    if (
      typeof values['expected-state'] !== 'string' ||
      values['expected-state'].length > 4096 ||
      values['patch-stdin'] !== true
    )
      throw new CliLiveError(
        'usage',
        'Pass the observed --expected-state and a single preference as --patch-stdin.',
      );
    const text = (await io.readStdin?.()) ?? '';
    if (text.length > (command === 'client-layout-set' ? 16384 : 4096))
      throw new CliLiveError('invalid-input', 'Preference patch exceeds 4 KiB.');
    try {
      args.patch = JSON.parse(text);
    } catch {
      throw new CliLiveError('invalid-input', 'Preference patch must be JSON.');
    }
    args.scope = values.scope;
    args.expectedState = values['expected-state'];
  }
  return { command, args, write };
}

export async function parseHumanPreferences(
  command: string,
  rest: string[],
  values: Record<string, unknown>,
  io: BotCreateCliIo,
): Promise<AgentManagementInvocation | undefined> {
  if (!['human-name-set', 'messaging-defaults', 'messaging-defaults-set'].includes(command))
    return undefined;
  const name = command === 'human-name-set';
  const write = name || command.endsWith('-set');
  const allowed = new Set([
    'compact',
    'help',
    'timeout',
    ...(name ? ['name', 'clear', 'expected-state'] : write ? ['input-stdin'] : []),
  ]);
  if (Object.entries(values).some(([key, value]) => value !== undefined && !allowed.has(key)))
    throw new CliLiveError('agent-scope-denied', 'Unsupported scoped preference option.');
  if (rest.length !== (name ? 0 : 1))
    throw new CliLiveError('usage', 'Choose the intended preference target.');
  if (name) {
    if (
      (values.clear === true) === (values.name !== undefined) ||
      typeof values['expected-state'] !== 'string'
    )
      throw new CliLiveError('usage', 'Use --name or --clear and the observed --expected-state.');
    return {
      command,
      args: {
        displayName: values.clear ? null : values.name,
        expectedState: values['expected-state'],
      },
      write,
    };
  }
  if (!write) return { command, args: { platform: rest[0] }, write };
  if (values['input-stdin'] !== true)
    throw new CliLiveError('usage', 'Use --input-stdin with the observed revision.');
  const raw = (await io.readStdin?.()) ?? '';
  if (raw.length > 4096) throw new CliLiveError('invalid-input', 'Preference input exceeds 4 KiB.');
  let input: unknown;
  try {
    input = JSON.parse(raw);
  } catch {
    throw new CliLiveError('invalid-input', 'Preference input must be JSON.');
  }
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new CliLiveError('invalid-input', 'Preference input must be an object.');
  return { command, args: { input: { ...input, platform: rest[0] } }, write };
}

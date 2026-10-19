import { CliLiveError } from './cli-live-error.js';
import type { BotCreateCliIo } from './bot-create-cli.js';
export const APPEARANCE_COMMANDS = [
  {
    command: 'appearance-clients',
    description: 'list online Client targets for device-local DeepSeekBot appearance',
  },
  {
    command: 'appearance-get',
    description: 'read device-local appearance from an explicit --client-id',
  },
  {
    command: 'appearance-set',
    description: 'write --patch-stdin to an explicit --client-id with --expected-revision',
  },
] as const;
export const APPEARANCE_OPTIONS = { 'client-id': { type: 'string' } } as const;
export async function runAppearanceCommand(
  command: string,
  rest: string[],
  values: {
    'client-id'?: string;
    'expected-revision'?: string;
    'patch-stdin'?: boolean;
  },
  io: BotCreateCliIo,
  connect: () => Promise<{
    http(path: string, body?: Record<string, unknown>): Promise<{ bytes: Uint8Array }>;
  }>,
) {
  if (rest.length || (command !== 'appearance-clients' && !values['client-id']))
    throw new CliLiveError('usage', 'Specify exactly one --client-id from appearance-clients.');
  if (command === 'appearance-clients' && values['client-id'])
    throw new CliLiveError('usage', 'appearance-clients does not take a target.');
  let patch: unknown;
  if (command === 'appearance-set') {
    if (!values['patch-stdin'] || !values['expected-revision'])
      throw new CliLiveError(
        'usage',
        'appearance-set needs --patch-stdin and --expected-revision from appearance-get.',
      );
    try {
      patch = JSON.parse(await (io.readStdin?.() ?? Promise.resolve('')));
    } catch {
      throw new CliLiveError('usage', 'Invalid appearance JSON on stdin.');
    }
    if (typeof patch !== 'object' || patch === null || Array.isArray(patch))
      throw new CliLiveError('usage', 'Appearance patch must be an object.');
  } else if (values['patch-stdin'] || values['expected-revision'])
    throw new CliLiveError('usage', 'Write options require appearance-set.');
  const host = await connect();
  const response = await host.http(
    '/api/botharness/appearance-control',
    command === 'appearance-clients'
      ? undefined
      : {
          action: 'request',
          clientId: values['client-id'],
          ...(command === 'appearance-set'
            ? { patch, expectedRevision: values['expected-revision'] }
            : {}),
        },
  );
  return JSON.parse(new TextDecoder().decode(response.bytes)) as unknown;
}

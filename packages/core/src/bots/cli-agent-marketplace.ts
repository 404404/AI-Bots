import { basename } from 'node:path';
import { readBotZip } from './bot-zip.js';
import {
  validatedCreate,
  readBotImportArchive,
  expandGitHubRef,
  type BotCreateCliIo,
  type CreateValues,
} from './bot-create-cli.js';
import type { AgentManagementInvocation } from './cli-agent-management.js';
import { CliLiveError } from './cli-live-error.js';

export const TOB_MARKETPLACE_USAGE: Readonly<Record<string, string>> = {
  create:
    'deepseekbot create --operation-key <stable-key> [--name <name>] [--description <bio>] [--role <tag>] (--persona <SOUL> --core-memory <MEMORY> | --from-git <url> --expected-commit <observed-commit> | --from-zip <local-file> --expected-archive <observed-sha256> | --from-dir <local-directory> --expected-archive <observed-sha256>); blank creation still supports name-only, avatar and stdin personality options',
  'marketplace-list':
    'deepseekbot marketplace-list [--query <need>] [--topic <topic>] [--cursor <cursor>] [--sort updated|stars]',
  'marketplace-topics': 'deepseekbot marketplace-topics',
  'marketplace-detail': 'deepseekbot marketplace-detail <listing-id>',
  'bot-import-preview':
    'deepseekbot bot-import-preview (--from-git <url> | --from-zip <local-file> | --from-dir <local-directory>); inspect source commit or archive sha256 before create',
};
const sourceFlags = ['from-git', 'from-zip', 'from-dir'];
function usage(message: string): never {
  throw new CliLiveError('usage', message);
}
function text(value: unknown, label: string, max = 2048): string {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.length > max ||
    /[\u0000-\u001f\u007f]/u.test(value)
  )
    usage(label + ' needs bounded nonempty text.');
  return value.trim();
}
export async function parseAgentMarketplace(
  command: string,
  rest: string[],
  values: Record<string, unknown>,
  io: BotCreateCliIo,
): Promise<AgentManagementInvocation | undefined> {
  const imported = command === 'create' && sourceFlags.some((key) => values[key] !== undefined);
  if (!imported && (command === 'create' || !Object.hasOwn(TOB_MARKETPLACE_USAGE, command)))
    return undefined;
  const options =
    command === 'marketplace-list'
      ? ['query', 'topic', 'cursor', 'sort']
      : command === 'bot-import-preview'
        ? sourceFlags
        : imported
          ? [
              ...sourceFlags,
              'name',
              'description',
              'role',
              'operation-key',
              'expected-commit',
              'expected-archive',
            ]
          : [];
  const allowed = new Set(['compact', 'help', 'timeout', ...options]);
  if (Object.entries(values).some(([key, value]) => value !== undefined && !allowed.has(key)))
    throw new CliLiveError(
      'agent-scope-denied',
      'Unsupported option for the scoped Marketplace/import operation.',
    );
  if (rest.length !== (command === 'marketplace-detail' ? 1 : 0))
    usage('Unexpected Marketplace/import positional arguments.');
  if (command === 'marketplace-detail')
    return { command, args: { id: text(rest[0], 'Listing ID', 512) }, write: false };
  if (command === 'marketplace-topics') return { command, args: {}, write: false };
  if (command === 'marketplace-list') {
    const args: Record<string, unknown> = {};
    for (const [flag, field] of [
      ['query', 'q'],
      ['topic', 'topic'],
      ['cursor', 'cursor'],
    ] as const)
      if (values[flag] !== undefined) args[field] = text(values[flag], flag, 512);
    if (values.sort !== undefined) {
      if (!['updated', 'stars'].includes(String(values.sort)))
        usage('sort must be updated or stars.');
      args.sort = values.sort;
    }
    return { command, args, write: false };
  }
  if (sourceFlags.filter((key) => values[key] !== undefined).length !== 1)
    usage('Choose exactly one Git, ZIP or directory source.');
  const git = values['from-git'] !== undefined;
  const args: Record<string, unknown> = { sourceKind: git ? 'git' : 'archive' };
  if (git) args.gitUrl = expandGitHubRef(text(values['from-git'], 'Git URL'));
  let upload: Uint8Array | undefined;
  if (command === 'create') {
    const key = text(values['operation-key'], 'operation-key', 128);
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/u.test(key))
      usage('A stable 8–128 character operation key is required.');
    args.operationKey = key;
    const validated = await validatedCreate(
      values as CreateValues,
      () => io.readStdin?.() ?? Promise.resolve(''),
    );
    if (validated.source.kind === 'git') args.gitUrl = validated.source.gitUrl;
    if (validated.displayName !== undefined) args.displayName = validated.displayName;
    if (validated.description !== undefined) args.description = validated.description;
    if (validated.roles !== undefined) args.roles = validated.roles;
    const expected = text(
      values[git ? 'expected-commit' : 'expected-archive'],
      git ? 'expected-commit' : 'expected-archive',
      64,
    );
    if (!new RegExp(git ? '^(?:[a-f0-9]{40}|[a-f0-9]{64})$' : '^[a-f0-9]{64}$', 'u').test(expected))
      usage('Use the observed immutable source fingerprint.');
    args[git ? 'expectedCommit' : 'expectedArchive'] = expected;
  }
  if (!git) {
    const local = readBotImportArchive(
      typeof values['from-zip'] === 'string'
        ? { zip: values['from-zip'] }
        : { directory: text(values['from-dir'], 'Directory') },
    );
    upload = local.archive;
    if (imported && args.displayName === undefined && typeof values['from-zip'] === 'string') {
      const stem = basename(values['from-zip'])
        .replace(/\.zip$/iu, '')
        .trim();
      args.displayName =
        readBotZip(local.archive).descriptor?.name ?? ([...stem].slice(0, 60).join('') || 'Bot');
    }
  }
  return { command, args, write: imported, ...(upload === undefined ? {} : { upload }) };
}

import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import type { BotCreateCliIo } from './bot-create-cli.js';
import type { AgentManagementInvocation } from './cli-agent-management.js';
import type { connectLiveHost } from './cli-live.js';
import { CliLiveError } from './cli-live-error.js';
import { BOT_ZIP_MAX_BYTES } from './bot-zip.js';

export const BOT_TRANSFER_OPTIONS = {
  all: { type: 'boolean' },
  history: { type: 'boolean' },
  include: { type: 'string', multiple: true },
} as const;
export const BOT_TRANSFER_COMMANDS = [
  {
    command: 'bot-zip-files',
    description: 'list eligible portable Bot files and their export fingerprint',
  },
  {
    command: 'bot-zip-export',
    description: 'export portable Bot files to a new --out file; history requires --all',
  },
];
export const BOT_TRANSFER_USAGE = {
  'bot-zip-files': 'deepseekbot bot-zip-files <bot-slug>',
  'bot-zip-export':
    'deepseekbot bot-zip-export <bot-slug> --out <new-path> (--all | --include <relative-path> ...) [--history] --expected-state <observed-fingerprint>',
};
export interface BotTransferValues {
  all?: boolean;
  history?: boolean;
  include?: string[];
  out?: string;
  'expected-state'?: string;
}
export function parseBotTransfer(
  command: string,
  rest: string[],
  values: Record<string, unknown>,
  scoped: boolean,
): AgentManagementInvocation | undefined {
  if (!BOT_TRANSFER_COMMANDS.some((entry) => entry.command === command)) return undefined;
  const read = command === 'bot-zip-files';
  const allowed = new Set([
    'compact',
    'help',
    'timeout',
    ...(!scoped ? ['host', 'token-file'] : []),
    ...(!read ? ['all', 'include', 'history', 'out', 'expected-state'] : []),
  ]);
  if (Object.entries(values).some(([key, value]) => value !== undefined && !allowed.has(key)))
    throw new CliLiveError(
      scoped ? 'agent-scope-denied' : 'usage',
      'Unsupported Bot transfer option.',
    );
  if (
    rest.length !== 1 ||
    !rest[0]?.trim() ||
    rest[0].length > 512 ||
    /[\u0000-\u001f\u007f]/u.test(rest[0])
  )
    throw new CliLiveError('usage', 'Exactly one Bot slug is required.');
  const args: Record<string, unknown> = { slug: rest[0].trim() };
  if (!read) {
    if (typeof values.out !== 'string' || !values.out.trim())
      throw new CliLiveError('usage', 'Export requires --out for a new local file.');
    if (
      (values.all !== undefined && typeof values.all !== 'boolean') ||
      (values.history !== undefined && typeof values.history !== 'boolean')
    )
      throw new CliLiveError('usage', '--all and --history are flags.');
    const include = values.include;
    if (
      (values.all === true) === (include !== undefined) ||
      (include !== undefined &&
        (!Array.isArray(include) ||
          !include.length ||
          !include.every((path) => typeof path === 'string')))
    )
      throw new CliLiveError('usage', 'Choose exactly one of --all or repeated --include paths.');
    if (values.history === true && values.all !== true)
      throw new CliLiveError('usage', 'Git history requires --all.');
    if (
      typeof values['expected-state'] !== 'string' ||
      !/^[a-f0-9]{64}$/u.test(values['expected-state'])
    )
      throw new CliLiveError('usage', 'Export requires --expected-state from bot-zip-files.');
    Object.assign(args, {
      history: values.history === true,
      expectedState: values['expected-state'],
      ...(include === undefined ? {} : { include }),
    });
  }
  return { command, args, write: !read };
}
export function saveBotArchive(out: unknown, bytes: Uint8Array, metadata: unknown = {}) {
  if (typeof out !== 'string' || !out.trim())
    throw new CliLiveError('usage', 'A new --out file is required.');
  if (bytes.byteLength > BOT_ZIP_MAX_BYTES)
    throw new CliLiveError('too-large', 'Bot ZIP exceeds the 100 MiB limit.');
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const info =
    typeof metadata === 'object' && metadata !== null ? (metadata as Record<string, unknown>) : {};
  if (info.sha256 !== undefined && (info.sha256 !== sha256 || info.bytes !== bytes.byteLength))
    throw new CliLiveError('readback-mismatch', 'Archive transfer integrity check failed.');
  try {
    writeFileSync(out, bytes, { flag: 'wx', mode: 0o600 });
  } catch (error) {
    throw new CliLiveError(
      error instanceof Error && 'code' in error && error.code === 'EEXIST'
        ? 'output-exists'
        : 'output-unavailable',
      'The output could not be created; choose a new writable --out path.',
    );
  }
  return {
    ...info,
    download: { path: out, bytes: bytes.byteLength, sha256, mime: 'application/zip' },
  };
}
export async function readBotArchive(response: Response): Promise<Uint8Array> {
  const reader = response.body?.getReader();
  if (!reader) throw new CliLiveError('host-protocol-error', 'Archive response has no body.');
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > BOT_ZIP_MAX_BYTES) {
        await reader.cancel();
        throw new CliLiveError('too-large', 'Bot ZIP exceeds the 100 MiB limit.');
      }
      chunks.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks);
}
export async function runBotTransfer(
  command: string,
  rest: string[],
  values: BotTransferValues & { host?: string; 'token-file'?: string; timeout?: string },
  io: BotCreateCliIo,
  connect: typeof connectLiveHost,
) {
  const operation = parseBotTransfer(command, rest, { ...values }, false)!;
  const seconds = values.timeout === undefined ? 120 : Number(values.timeout);
  if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 600)
    throw new CliLiveError('usage', '--timeout must be between 0 and 600 seconds.');
  const host = await connect(values, io, AbortSignal.timeout(Math.ceil(seconds * 1000)));
  if (command === 'bot-zip-files') {
    const { bytes } = await host.http(
      '/api/botharness/bot-zip/files?' +
        new URLSearchParams({ slug: String(operation.args.slug), snapshot: '1' }),
    );
    return JSON.parse(new TextDecoder().decode(bytes));
  }
  const response = await host.stream('/api/botharness/bot-zip', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(operation.args),
  });
  const bytes = await readBotArchive(response);
  const encoded = response.headers.get('x-botharness-result');
  if (!encoded || response.headers.get('content-type') !== 'application/zip')
    throw new CliLiveError('host-protocol-error', 'The Host returned no checked archive metadata.');
  return saveBotArchive(
    values.out,
    bytes,
    JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')),
  );
}

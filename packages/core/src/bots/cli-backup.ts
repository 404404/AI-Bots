import { createHash, randomUUID } from 'node:crypto';
import {
  closeSync,
  constants,
  fstatSync,
  fsyncSync,
  linkSync,
  lstatSync,
  openSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, isAbsolute, join } from 'node:path';
import type { BotCreateCliIo } from './bot-create-cli.js';
import { CliLiveError } from './cli-live-error.js';

export const BACKUP_COMMANDS = [
  {
    command: 'profile-backup-preview',
    description: 'prepare a Profile backup; save its private review plan with --out',
  },
  {
    command: 'profile-backup-export',
    description: 'export a reviewed Profile backup from --file to a new --out file with --confirm',
  },
  {
    command: 'profile-backup-inspect',
    description: 'inspect a backup file through the live Host without returning its content',
  },
  { command: 'profile-recovery', description: 'read restored Profile recovery readiness' },
  {
    command: 'profile-recovery-authorize',
    description: 'authorize one restored Bot model with --confirm',
  },
  {
    command: 'profile-recovery-activate',
    description: 'activate one restored Bot with --confirm --acknowledge-split-brain',
  },
] as const;
export const BACKUP_OPTIONS = {
  plan: { type: 'string' },
  receipt: { type: 'string' },
  'acknowledge-split-brain': { type: 'boolean' },
} as const;
export interface BackupValues {
  file?: string;
  out?: string;
  confirm?: boolean;
  'acknowledge-split-brain'?: boolean;
  host?: string;
  plan?: string;
  receipt?: string;
  'expected-revision'?: string;
  'expected-state'?: string;
}
export type BackupTransport = (path: string, init?: RequestInit) => Promise<Response>;
const ROUTES = {
  preview: '/api/botharness/profile-backup',
  export: '/api/botharness/profile-backup',
  inspect: '/api/botharness/profile-backup/inspect',
  recovery: '/api/botharness/profile-backup/recovery',
  authorize: '/api/botharness/profile-backup/authorize',
  activate: '/api/botharness/profile-backup/activate',
};
export const BACKUP_OWNER_CODES = new Set([
  'preview-stale',
  'activation-required',
  'invalid-input',
  'model-plan-required',
  'plan-changed',
  'package-invalid',
  'too-large',
  'snapshot-changed',
  'operation-busy',
  'dependency-incompatible',
  'upgrade-required',
  'required-file-missing',
  'destination-exists',
  'cancelled',
  'operation-failed',
]);
const MAX_BYTES = 512 * 1024 * 1024;
function usage(message: string): never {
  throw new CliLiveError('usage', message);
}
export function isBackupCommand(command: string) {
  return BACKUP_COMMANDS.some((entry) => entry.command === command);
}
function absolute(value: string | undefined, flag: string): string {
  if (!value || !isAbsolute(value)) usage(`${flag} requires an absolute file path.`);
  return value;
}
function readProtected(path: string, limit: number, privateMode: boolean): Buffer {
  let fd: number | undefined;
  try {
    fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    const stat = fstatSync(fd);
    if (
      !stat.isFile() ||
      stat.size > limit ||
      (privateMode && process.platform !== 'win32' && (stat.mode & 0o077) !== 0)
    )
      throw new Error('invalid file');
    return readFileSync(fd);
  } catch {
    throw new CliLiveError(
      'protected-file-invalid',
      'Input must be a bounded regular file; review plans require private permissions.',
    );
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new CliLiveError('host-protocol-error', 'The Host returned an invalid receipt.');
  return value as Record<string, unknown>;
}
export function backupPreviewView(raw: unknown) {
  const value = object(raw);
  return {
    bots: value.bots,
    files: value.files,
    estimatedBytes: value.estimatedBytes,
    sessions: value.sessions,
  };
}
export function backupInspectionView(raw: unknown) {
  const value = object(raw),
    manifest = object(value.manifest);
  return {
    id: manifest.id,
    counts: manifest.counts,
    sessions: manifest.sessions,
    bytes: value.bytes,
    sha256: value.sha256,
    restore: value.restore,
  };
}
export function backupRecoveryView(raw: unknown) {
  const value = object(raw);
  return {
    restored: value.restored,
    bots: Array.isArray(value.bots)
      ? value.bots.map((rawBot) => {
          const bot = object(rawBot);
          return {
            slug: bot.slug,
            activated: bot.activated,
            planRevision: bot.planRevision,
            stateFingerprint: bot.stateFingerprint,
            readiness: bot.readiness,
            reason: bot.reason,
            route: bot.route,
            sessionId: bot.sessionId,
          };
        })
      : [],
  };
}
export async function backupJson(response: Response): Promise<unknown> {
  if (response.status === 401 || response.status === 403) {
    await response.body?.cancel();
    throw new CliLiveError(
      'host-unauthorized',
      'The Host refused this backup authority; refresh the authenticated connection.',
    );
  }
  let value: unknown;
  try {
    value = JSON.parse(await response.text());
  } catch {
    throw new CliLiveError('host-protocol-error', 'The Host returned no backup receipt.');
  }
  if (!response.ok) {
    const error = object(object(value).error);
    throw new CliLiveError(
      typeof error.code === 'string' && BACKUP_OWNER_CODES.has(error.code)
        ? error.code
        : 'host-refused',
      'The backup owner refused the operation; inspect current readiness before retrying.',
    );
  }
  return value;
}
export function privateBackupOutput(destination: string) {
  let stage: string | undefined;
  let fd: number | undefined;
  try {
    if (lstatSync(destination, { throwIfNoEntry: false })) throw new Error('destination-exists');
    stage = join(dirname(destination), '.' + basename(destination) + '.' + randomUUID() + '.part');
    fd = openSync(stage, 'wx', 0o600);
  } catch {
    throw new CliLiveError(
      'destination-exists',
      'Choose a new output file in an existing directory.',
    );
  }
  return {
    write(bytes: string | Uint8Array) {
      writeFileSync(fd!, bytes);
    },
    publish() {
      fsyncSync(fd!);
      closeSync(fd!);
      fd = undefined;
      try {
        linkSync(stage!, destination);
      } catch {
        throw new CliLiveError(
          'destination-exists',
          'The output path is occupied; verified bytes were not published.',
        );
      }
      unlinkSync(stage!);
      stage = undefined;
    },
    close() {
      if (fd !== undefined) {
        closeSync(fd);
        fd = undefined;
      }
      if (stage !== undefined) {
        try {
          unlinkSync(stage);
        } catch {}
        stage = undefined;
      }
    },
  };
}

export async function runBackupCommand(
  command: string,
  rest: string[],
  values: BackupValues,
  io: BotCreateCliIo,
  connect: () => Promise<{ stream: BackupTransport }>,
): Promise<unknown> {
  if (values.plan !== undefined || values.receipt !== undefined)
    usage(
      '--plan and --receipt are scoped Tob options; Human CLI uses protected --file/--out paths.',
    );
  const target =
    command === 'profile-recovery-authorize' || command === 'profile-recovery-activate';
  if (rest.length !== (target ? 1 : 0) || (target && !/^[a-z0-9][a-z0-9-]{0,63}$/u.test(rest[0]!)))
    usage(
      'This command requires exactly one Bot slug, or no target for backup and recovery queries.',
    );
  const exportFile = command === 'profile-backup-export';
  const preview = command === 'profile-backup-preview';
  const inspect = command === 'profile-backup-inspect';
  if (
    (values.file !== undefined && !exportFile && !inspect) ||
    (values.out !== undefined && !preview && !exportFile) ||
    (values.confirm !== undefined && !target && !exportFile) ||
    (values['acknowledge-split-brain'] !== undefined && command !== 'profile-recovery-activate') ||
    ((values['expected-revision'] !== undefined || values['expected-state'] !== undefined) &&
      !target)
  )
    usage('Unsupported option for this backup command.');
  if ((target || exportFile) && values.confirm !== true)
    usage('This change requires --confirm after reviewing its scope.');
  if (command === 'profile-recovery-activate' && values['acknowledge-split-brain'] !== true)
    usage(
      'Activation requires --acknowledge-split-brain; prevent duplicate execution on the original Host.',
    );
  const expectedRevision = values['expected-revision'];
  if (
    expectedRevision !== undefined &&
    (!/^\d+$/u.test(expectedRevision) || !Number.isSafeInteger(Number(expectedRevision)))
  )
    usage('--expected-revision must be a nonnegative integer.');
  const expectedState = values['expected-state'];
  if (expectedState !== undefined && !/^[a-f0-9]{64}$/u.test(expectedState))
    usage('--expected-state must be an observed recovery fingerprint.');
  const out = preview || exportFile ? absolute(values.out, '--out') : undefined;
  const file = exportFile || inspect ? absolute(values.file, '--file') : undefined;
  const origin = new URL(values.host ?? io.env['DEEPSEEKBOT_HOST'] ?? 'http://invalid').origin;
  let plan: Record<string, unknown> | undefined;
  let archive: Buffer | undefined;
  if (exportFile) {
    try {
      plan = object(JSON.parse(readProtected(file!, 16384, true).toString('utf8')));
    } catch {
      throw new CliLiveError(
        'protected-file-invalid',
        'Read a private review plan created by profile-backup-preview.',
      );
    }
    if (
      plan.origin !== origin ||
      typeof plan.token !== 'string' ||
      !/^[a-f0-9-]{36}$/u.test(plan.token)
    )
      throw new CliLiveError(
        'protected-file-invalid',
        'The private review plan does not belong to this Host.',
      );
  }
  if (inspect) archive = readProtected(file!, MAX_BYTES, false);
  const output = out === undefined ? undefined : privateBackupOutput(out);
  try {
    const { stream } = await connect();
    if (preview) {
      const value = object(await backupJson(await stream(ROUTES.preview)));
      if (typeof value.token !== 'string')
        throw new CliLiveError('host-protocol-error', 'The Host returned no private review plan.');
      output!.write(JSON.stringify({ ...backupPreviewView(value), token: value.token, origin }));
      output!.publish();
      return { ...backupPreviewView(value), planFile: out };
    }
    if (exportFile) {
      const response = await stream(ROUTES.export, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token: plan!.token }),
      });
      if (!response.ok) await backupJson(response);
      const hash = createHash('sha256');
      let bytes = 0;
      if (!response.body)
        throw new CliLiveError('host-protocol-error', 'The Host returned no archive.');
      for await (const chunk of response.body) {
        bytes += chunk.byteLength;
        if (bytes > MAX_BYTES)
          throw new CliLiveError('too-large', 'Backup exceeds the documented archive bound.');
        hash.update(chunk);
        output!.write(chunk);
      }
      const sha256 = hash.digest('hex');
      if (sha256 !== response.headers.get('x-backup-sha256'))
        throw new CliLiveError(
          'package-invalid',
          'Downloaded archive digest does not match the Host receipt.',
        );
      output!.publish();
      return { path: out, bytes, sha256, state: 'exported' };
    }
    if (inspect)
      return backupInspectionView(
        await backupJson(
          await stream(ROUTES.inspect, {
            method: 'POST',
            headers: { 'content-type': 'application/octet-stream' },
            body: new Uint8Array(archive!),
          }),
        ),
      );
    if (command === 'profile-recovery')
      return backupRecoveryView(await backupJson(await stream(ROUTES.recovery)));
    const action = command === 'profile-recovery-authorize' ? ROUTES.authorize : ROUTES.activate;
    return backupRecoveryView(
      await backupJson(
        await stream(action, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            slug: rest[0],
            ...(expectedRevision === undefined
              ? {}
              : { expectedRevision: Number(expectedRevision) }),
            ...(expectedState === undefined ? {} : { expectedState }),
            ...(action === ROUTES.activate ? { acknowledgeSplitBrain: true } : {}),
          }),
        }),
      ),
    );
  } finally {
    output?.close();
  }
}

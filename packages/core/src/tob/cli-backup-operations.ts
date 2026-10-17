import { randomUUID } from 'node:crypto';
import { lstatSync, mkdirSync, readFileSync, readdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import {
  BACKUP_COMMANDS,
  BACKUP_OWNER_CODES,
  privateBackupOutput,
  backupInspectionView,
  backupJson,
  backupPreviewView,
  backupRecoveryView,
} from '../bots/cli-backup.js';
import type { PersonaBotRegistry } from '../bots/registry.js';
import { PROFILE_BACKUP_PATH } from '../portability/http.js';
import { digest } from '../portability/files.js';
import type { PrepareTobOperation } from './cli-operations.js';
import { CliLiveError } from '../bots/cli-live-error.js';
import { TobError } from './service.js';
export const TOB_BACKUP_CAPABILITIES = BACKUP_COMMANDS.map((entry) => ({
  ...entry,
  write: !['profile-backup-preview', 'profile-backup-inspect', 'profile-recovery'].includes(
    entry.command,
  ),
}));
function keys(args: Record<string, unknown>, allowed: string[]) {
  if (Object.keys(args).some((key) => !allowed.includes(key))) throw new TobError('invalid-input');
}
function id(raw: unknown): string {
  if (typeof raw !== 'string' || !/^[a-f0-9-]{36}$/u.test(raw)) throw new TobError('invalid-input');
  return raw;
}
export function createTobBackupOperations(deps: {
  http(request: Request, authorize?: () => void): Promise<Response>;
  root: string;
  registry: Pick<PersonaBotRegistry, 'get'>;
}): PrepareTobOperation {
  let exporting = false;
  const plans = new Map<
    string,
    { token: string; view: ReturnType<typeof backupPreviewView>; expires: number }
  >();
  const request = (suffix: string, value?: Record<string, unknown>, authorize?: () => void) =>
    deps.http(
      new Request(
        'http://localhost' + PROFILE_BACKUP_PATH + suffix,
        value === undefined
          ? {}
          : {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify(value),
            },
      ),
      authorize,
    );
  const json = async (response: Response) => {
    try {
      return await backupJson(response);
    } catch (error) {
      if (error instanceof CliLiveError)
        throw new TobError(
          BACKUP_OWNER_CODES.has(error.code)
            ? error.code
            : error.code === 'host-unauthorized'
              ? 'tob-authority-required'
              : 'operation-failed',
        );
      throw error;
    }
  };
  const status = async () => backupRecoveryView(await json(await request('/recovery')));
  const snapshot = async (slug: string) => ({
    recovery: await status(),
    plan: structuredClone(deps.registry.get(slug)?.modelPlan),
  });
  const folder = () => {
    mkdirSync(deps.root, { recursive: true, mode: 0o700 });
    const stat = lstatSync(deps.root);
    if (
      stat.isSymbolicLink() ||
      !stat.isDirectory() ||
      (process.platform !== 'win32' && (stat.mode & 0o077) !== 0)
    )
      throw new TobError('invalid-input');
    return deps.root;
  };
  return async (command, args) => {
    if (!TOB_BACKUP_CAPABILITIES.some((entry) => entry.command === command)) return undefined;
    if (command === 'profile-backup-preview') {
      keys(args, []);
      return {
        async run(guard) {
          guard();
          const raw = (await json(await request(''))) as Record<string, unknown>;
          guard();
          if (typeof raw.token !== 'string') throw new TobError('unavailable');
          for (const [key, plan] of plans) if (plan.expires < Date.now()) plans.delete(key);
          if (plans.size >= 32) plans.delete(plans.keys().next().value!);
          const planId = randomUUID(),
            view = backupPreviewView(raw);
          plans.set(planId, { token: raw.token, view, expires: Date.now() + 300000 });
          return { ...view, planId };
        },
      };
    }
    if (command === 'profile-recovery') {
      keys(args, []);
      return {
        async run(guard) {
          guard();
          const value = await status();
          guard();
          return value;
        },
      };
    }
    if (command === 'profile-backup-export') {
      keys(args, ['planId', 'confirm']);
      if (args.confirm !== true) throw new TobError('confirmation-required');
      const planId = id(args.planId),
        plan = plans.get(planId);
      const archiveFile = join(folder(), planId + '.botharness-backup');
      const completed = () => {
        const stat = lstatSync(archiveFile, { throwIfNoEntry: false });
        if (!stat) return undefined;
        if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 512 * 1024 * 1024)
          throw new TobError('invalid-input');
        const archive = readFileSync(archiveFile);
        return {
          receiptId: planId,
          archiveFile,
          bytes: archive.length,
          sha256: digest(archive),
          state: 'exported',
          reconciled: true,
        };
      };
      if (completed())
        return {
          run(guard) {
            guard();
            const receipt = completed();
            if (!receipt) throw new TobError('preview-stale');
            return receipt;
          },
        };
      if (!plan || plan.expires < Date.now()) throw new TobError('preview-stale');
      return {
        proposal: Object.freeze({
          command,
          target: 'Profile',
          previousValue: plan.view,
          patch: { export: true, planId, destination: 'protected-host-file' },
        }),
        async run(guard, beforeEffect) {
          guard();
          if (plans.get(planId) !== plan || plan.expires < Date.now())
            throw new TobError('preview-stale');
          if (exporting) throw new TobError('operation-busy');
          exporting = true;
          try {
            const root = folder();
            const files = readdirSync(root).filter((name) => name.endsWith('.botharness-backup'));
            if (
              files.length >= 8 ||
              files.reduce((sum, name) => sum + lstatSync(join(root, name)).size, 0) >
                512 * 1024 * 1024
            )
              throw new TobError('too-large');
            beforeEffect?.();
            plans.delete(planId);
            const response = await request('', { token: plan.token });
            if (!response.ok) await json(response);
            const archive = Buffer.from(await response.arrayBuffer());
            if (
              archive.byteLength +
                files.reduce((sum, name) => sum + lstatSync(join(root, name)).size, 0) >
              512 * 1024 * 1024
            )
              throw new TobError('too-large');
            const sha256 = digest(archive);
            if (sha256 !== response.headers.get('x-backup-sha256'))
              throw new TobError('package-invalid');
            const receiptId = planId;
            const output = privateBackupOutput(archiveFile);
            try {
              output.write(archive);
              guard();
              output.publish();
            } finally {
              output.close();
            }
            try {
              guard();
            } catch {
              unlinkSync(archiveFile);
              throw new TobError('operation-outcome-uncertain');
            }
            return { receiptId, archiveFile, bytes: archive.byteLength, sha256, state: 'exported' };
          } finally {
            exporting = false;
          }
        },
      };
    }
    if (command === 'profile-backup-inspect') {
      keys(args, ['receiptId']);
      const receiptId = id(args.receiptId);
      return {
        async run(guard) {
          guard();
          const archiveFile = join(folder(), receiptId + '.botharness-backup');
          let archive: Buffer;
          try {
            const stat = lstatSync(archiveFile);
            if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 512 * 1024 * 1024)
              throw new Error();
            archive = readFileSync(archiveFile);
          } catch {
            throw new TobError('invalid-input');
          }
          const value = await json(
            await deps.http(
              new Request('http://localhost' + PROFILE_BACKUP_PATH + '/inspect', {
                method: 'POST',
                body: new Uint8Array(archive),
              }),
            ),
          );
          guard();
          return { ...backupInspectionView(value), receiptId };
        },
      };
    }
    keys(args, [
      'slug',
      'confirm',
      ...(command === 'profile-recovery-activate' ? ['acknowledgeSplitBrain'] : []),
    ]);
    if (args.confirm !== true) throw new TobError('confirmation-required');
    if (typeof args.slug !== 'string' || !/^[a-z0-9][a-z0-9-]{0,63}$/u.test(args.slug))
      throw new TobError('invalid-input');
    const slug = args.slug,
      activate = command === 'profile-recovery-activate';
    if (activate && args.acknowledgeSplitBrain !== true) throw new TobError('activation-required');
    const previous = await snapshot(slug);
    return {
      proposal: Object.freeze({
        command,
        target: slug,
        previousValue: previous,
        patch: { authorizeModel: !activate, activate, acknowledgeSplitBrain: activate },
      }),
      async run(guard, beforeEffect) {
        guard();
        if (!isDeepStrictEqual(await snapshot(slug), previous)) throw new TobError('stale-setting');
        guard();
        beforeEffect?.();
        const raw = await json(
          await request(
            activate ? '/activate' : '/authorize',
            {
              slug,
              expectedRevision: previous.plan?.revision,
              expectedState: previous.recovery.bots.find((bot) => bot.slug === slug)
                ?.stateFingerprint,
              ...(activate ? { acknowledgeSplitBrain: true } : {}),
            },
            guard,
          ),
        );
        try {
          guard();
        } catch {
          throw new TobError('operation-outcome-uncertain');
        }
        return backupRecoveryView(raw);
      },
    };
  };
}

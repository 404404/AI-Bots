import type { AgentManagementInvocation } from './cli-agent-management.js';
import { isBackupCommand } from './cli-backup.js';
import { CliLiveError } from './cli-live-error.js';
export const TOB_AGENT_BACKUP_USAGE: Readonly<Record<string, string>> = {
  'profile-backup-preview':
    'deepseekbot profile-backup-preview; returns a safe planId, never the private export token',
  'profile-backup-export':
    'deepseekbot profile-backup-export --plan <reviewed-planId> --confirm; protected Host output only; receiptId equals planId, and completed same-plan replay only reads the original artifact',
  'profile-backup-inspect':
    'deepseekbot profile-backup-inspect --receipt <export-receiptId>; bounded manifest metadata only',
  'profile-recovery': 'deepseekbot profile-recovery',
  'profile-recovery-authorize': 'deepseekbot profile-recovery-authorize <bot-slug> --confirm',
  'profile-recovery-activate':
    'deepseekbot profile-recovery-activate <bot-slug> --confirm --acknowledge-split-brain',
};
export function parseAgentBackup(
  command: string,
  rest: string[],
  values: Record<string, unknown>,
): AgentManagementInvocation | undefined {
  if (!isBackupCommand(command)) return undefined;
  const write = [
    'profile-backup-export',
    'profile-recovery-authorize',
    'profile-recovery-activate',
  ].includes(command);
  const target = command.startsWith('profile-recovery-');
  const allowed = new Set([
    'compact',
    'help',
    'timeout',
    ...(write ? ['confirm'] : []),
    ...(command === 'profile-backup-export' ? ['plan'] : []),
    ...(command === 'profile-backup-inspect' ? ['receipt'] : []),
    ...(command === 'profile-recovery-activate' ? ['acknowledge-split-brain'] : []),
  ]);
  if (Object.entries(values).some(([key, value]) => value !== undefined && !allowed.has(key)))
    throw new CliLiveError(
      'agent-scope-denied',
      'Backup content and private review tokens must remain on the protected Host file path.',
    );
  if (rest.length !== (target ? 1 : 0))
    throw new CliLiveError('usage', 'Supply one Bot slug only for recovery changes.');
  if (write && values.confirm !== true)
    throw new CliLiveError('usage', 'Review this operation and pass --confirm.');
  const args: Record<string, unknown> = {};
  if (target) {
    if (!/^[a-z0-9][a-z0-9-]{0,63}$/u.test(rest[0]!))
      throw new CliLiveError('usage', 'Supply one Bot slug.');
    args.slug = rest[0];
  }
  if (write) args.confirm = true;
  for (const [flag, key] of [
    ['plan', 'planId'],
    ['receipt', 'receiptId'],
  ] as const)
    if (allowed.has(flag)) {
      if (typeof values[flag] !== 'string' || !/^[a-f0-9-]{36}$/u.test(values[flag]))
        throw new CliLiveError('usage', `--${flag} requires an observed receipt identifier.`);
      args[key] = values[flag];
    }
  if (command === 'profile-recovery-activate') {
    if (values['acknowledge-split-brain'] !== true)
      throw new CliLiveError('usage', 'Activation requires --acknowledge-split-brain.');
    args.acknowledgeSplitBrain = true;
  }
  return { command, args, write };
}

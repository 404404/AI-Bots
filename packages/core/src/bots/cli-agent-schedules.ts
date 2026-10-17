import type { AgentManagementInvocation } from './cli-agent-management.js';
import { CliLiveError } from './cli-live-error.js';
import { isScheduleCommand, prepareScheduleCommand, type ScheduleValues } from './cli-schedules.js';

const TRIGGERS = [
  'every',
  'daily',
  'weekly',
  'weekdays',
  'once-date',
  'once-time',
  'cron',
  'timezone',
];
const EDITS = ['title', 'prompt', ...TRIGGERS, 'enabled', 'disabled', 'locked', 'unlocked'];
const OPTIONS: Record<string, string[]> = {
  schedules: [],
  'schedule-preview': TRIGGERS,
  'schedule-history': ['sid'],
  'schedule-create': [...EDITS, 'operation-key', 'expected-state'],
  'schedule-update': [...EDITS, 'sid', 'expected-state'],
  'schedule-delete': ['sid', 'confirm', 'expected-state'],
  'schedule-run-now': ['sid', 'expected-state'],
};
const triggerUsage =
  '(--every <seconds> | --daily <HH:MM> | --weekly <HH:MM> --weekdays <0-6,...> | --once-date <YYYY-MM-DD> --once-time <HH:MM> | --cron <expression>) [--timezone <IANA-zone> (required for calendar triggers)]';
export const TOB_AGENT_SCHEDULE_COMMAND_USAGE: Readonly<Record<string, string>> = {
  schedules: 'deepseekbot schedules <bot-slug>',
  'schedule-preview': 'deepseekbot schedule-preview ' + triggerUsage,
  'schedule-history': 'deepseekbot schedule-history <bot-slug> --sid <schedule-id>',
  'schedule-create':
    'deepseekbot schedule-create <bot-slug> --title <title> --prompt <prompt> ' +
    triggerUsage +
    ' [--enabled|--disabled] [--locked|--unlocked] --operation-key <stable-key> --expected-state <list-stateFingerprint>',
  'schedule-update':
    'deepseekbot schedule-update <bot-slug> --sid <schedule-id> [--title <title>] [--prompt <prompt>] [trigger flags] [--enabled|--disabled] [--locked|--unlocked] --expected-state <schedule-stateFingerprint>; a locked schedule only permits an explicit unlock-only patch',
  'schedule-delete':
    'deepseekbot schedule-delete <bot-slug> --sid <schedule-id> --expected-state <schedule-stateFingerprint> --confirm',
  'schedule-run-now':
    'deepseekbot schedule-run-now <bot-slug> --sid <schedule-id> --expected-state <schedule-stateFingerprint>; never automatically retry an uncertain firing; read schedule-history first',
};
export function parseAgentSchedules(
  command: string,
  rest: string[],
  values: Record<string, unknown>,
): AgentManagementInvocation | undefined {
  if (!isScheduleCommand(command)) return undefined;
  const allowed = new Set(['compact', 'help', 'timeout', ...OPTIONS[command]!]);
  if (Object.entries(values).some(([key, value]) => value !== undefined && !allowed.has(key)))
    throw new CliLiveError(
      'agent-scope-denied',
      'This option is not available for the scoped schedule operation.',
    );
  const write = !['schedules', 'schedule-preview', 'schedule-history'].includes(command);
  const prepared = prepareScheduleCommand(command, rest, values as ScheduleValues);
  const args = prepared.args;
  if (write) {
    if (
      typeof values['expected-state'] !== 'string' ||
      !/^[a-f0-9]{64}$/u.test(values['expected-state'])
    )
      throw new CliLiveError(
        'usage',
        '--expected-state requires the observed schedule or list fingerprint.',
      );
    args.expectedState = values['expected-state'];
  }
  if (command === 'schedule-create') {
    const key = values['operation-key'];
    if (typeof key !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/u.test(key))
      throw new CliLiveError(
        'usage',
        '--operation-key requires a stable key of 8-128 letters, digits, dot, colon, underscore or hyphen.',
      );
    args.operationKey = key;
  }
  if (command === 'schedule-delete') args.confirm = true;
  return { command, args, write };
}

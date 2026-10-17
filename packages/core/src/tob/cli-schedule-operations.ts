import { createHash } from 'node:crypto';
import type { PersonaBotRegistry } from '../bots/registry.js';
import {
  BotScheduleError,
  previewBotScheduleTrigger,
  type BotSchedule,
  type BotScheduleChange,
  type BotScheduleInput,
  type BotScheduleStore,
  type BotScheduleTrigger,
} from '../schedules/bot-schedules.js';
import type { PrepareTobOperation, TobCliCapability } from './cli-operations.js';
import { TobError } from './service.js';

export const TOB_SCHEDULE_CAPABILITIES: readonly TobCliCapability[] = [
  {
    command: 'schedules',
    description:
      'Read a selected Bot’s schedules, timezone, next occurrence and state fingerprints',
    write: false,
  },
  {
    command: 'schedule-preview',
    description: 'Preview a fully specified trigger without creating work',
    write: false,
  },
  {
    command: 'schedule-history',
    description: 'Read actual firing history and its canonical Source Event and Session',
    write: false,
  },
  {
    command: 'schedule-create',
    description:
      'Create a reviewed schedule with a stable operation key; reconcile that key before retrying',
    write: true,
  },
  {
    command: 'schedule-update',
    description: 'Edit or enable/disable a reviewed schedule at its observed state',
    write: true,
  },
  {
    command: 'schedule-delete',
    description: 'Delete a reviewed schedule and its history with explicit confirmation',
    write: true,
  },
  {
    command: 'schedule-run-now',
    description:
      'Admit a reviewed manual firing; inspect history after an uncertain response and never retry automatically',
    write: true,
  },
];
function hash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
function text(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value !== value.trim() ||
    value.length > 512 ||
    [...value].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)
  )
    throw new TobError('invalid-input');
  return value;
}
function keys(value: Record<string, unknown>, allowed: string[]) {
  if (Object.keys(value).some((key) => !allowed.includes(key))) throw new TobError('invalid-input');
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new TobError('invalid-input');
  return value as Record<string, unknown>;
}
function owner<T>(call: () => T): T {
  try {
    return call();
  } catch (error) {
    if (error instanceof BotScheduleError) throw new TobError(error.code);
    throw error;
  }
}
function changes(value: unknown, create: boolean): BotScheduleChange {
  const input = object(value);
  keys(input, ['title', 'prompt', 'trigger', 'enabled', 'locked']);
  const result: BotScheduleChange = {};
  for (const field of ['title', 'prompt'] as const) {
    const v = input[field];
    if (v === undefined && !create) continue;
    if (
      typeof v !== 'string' ||
      !v.trim() ||
      v !== v.trim() ||
      v.length > (field === 'title' ? 120 : 4000) ||
      v.includes('\u0000')
    )
      throw new TobError('invalid-input');
    result[field] = v;
  }
  for (const field of ['enabled', 'locked'] as const) {
    if (input[field] === undefined) continue;
    if (typeof input[field] !== 'boolean') throw new TobError('invalid-input');
    result[field] = input[field];
  }
  if (create || input.trigger !== undefined) {
    const trigger = object(input.trigger);
    const fields: Record<string, string[]> = {
      every: ['kind', 'everySeconds'],
      daily: ['kind', 'time', 'timeZone'],
      weekly: ['kind', 'time', 'timeZone', 'weekdays'],
      once: ['kind', 'date', 'time', 'timeZone'],
      cron: ['kind', 'expression', 'timeZone'],
    };
    const allowed = fields[String(trigger.kind)];
    if (!Array.isArray(allowed) || Object.keys(trigger).length !== allowed.length)
      throw new TobError('invalid-input');
    keys(trigger, allowed);
    if (trigger.kind === 'every') {
      if (
        typeof trigger.everySeconds !== 'number' ||
        !Number.isSafeInteger(trigger.everySeconds) ||
        trigger.everySeconds < 60
      )
        throw new TobError('invalid-input');
    } else {
      text(trigger.timeZone);
      if (trigger.kind === 'cron') text(trigger.expression);
      else if (typeof trigger.time !== 'string' || !/^\d{2}:\d{2}(?::\d{2})?$/u.test(trigger.time))
        throw new TobError('invalid-input');
      if (
        trigger.kind === 'once' &&
        (typeof trigger.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(trigger.date))
      )
        throw new TobError('invalid-input');
      if (
        trigger.kind === 'weekly' &&
        (!Array.isArray(trigger.weekdays) ||
          !trigger.weekdays.length ||
          trigger.weekdays.some((day) => !Number.isInteger(day) || day < 0 || day > 6))
      )
        throw new TobError('invalid-input');
    }
    result.trigger = trigger as unknown as BotScheduleTrigger;
  }
  if (!Object.keys(result).length) throw new TobError('invalid-input');
  return result;
}
function stable(schedule: BotSchedule) {
  const { nextRunAt: _next, lastFiring: _firing, ...state } = schedule;
  return state;
}
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

export function createTobScheduleOperations(deps: {
  schedules: BotScheduleStore;
  registry: Pick<PersonaBotRegistry, 'get'>;
  isProtectedBot(slug: string): boolean;
}): PrepareTobOperation {
  const bot = (slug: string) => {
    if (deps.isProtectedBot(slug)) throw new TobError('protected-bot');
    const record = deps.registry.get(slug);
    if (!record) throw new TobError('unknown-bot');
    if (record.paused) throw new TobError('archived-bot');
    return { slug, createdAt: record.createdAt };
  };
  return (command, raw) => {
    if (!TOB_SCHEDULE_CAPABILITIES.some((entry) => entry.command === command)) return undefined;
    const args = structuredClone(raw);
    if (command === 'schedule-preview') {
      keys(args, ['trigger']);
      const trigger = changes(
        { title: 'preview', prompt: 'preview', trigger: args.trigger },
        true,
      ).trigger!;
      return {
        run(guard) {
          guard();
          return { trigger, occurrences: owner(() => previewBotScheduleTrigger(trigger)) };
        },
      };
    }
    const read = command === 'schedules' || command === 'schedule-history';
    keys(args, [
      'slug',
      ...(['schedules', 'schedule-create'].includes(command) ? [] : ['id']),
      ...(read ? [] : ['expectedState']),
      ...(command === 'schedule-create' ? ['input', 'operationKey'] : []),
      ...(command === 'schedule-update' ? ['change'] : []),
      ...(command === 'schedule-delete' ? ['confirm'] : []),
    ]);
    const slug = text(args.slug);
    const selected = bot(slug);
    const list = () => {
      const identity = bot(slug);
      if (identity.createdAt !== selected.createdAt) throw new TobError('stale-profile');
      return owner(() => deps.schedules.list(slug));
    };
    const state = (schedule: BotSchedule) => hash({ bot: selected, schedule: stable(schedule) });
    const collection = () => {
      const schedules = list();
      return {
        schedules: schedules.map((schedule) => ({
          ...schedule,
          stateFingerprint: state(schedule),
        })),
        stateFingerprint: hash({ bot: selected, schedules: schedules.map(stable) }),
      };
    };
    if (command === 'schedules')
      return {
        run(guard) {
          guard();
          return collection();
        },
      };
    const current = () => {
      const schedule = list().find((row) => row.id === text(args.id));
      if (!schedule) throw new TobError('unknown-schedule');
      return schedule;
    };
    if (command === 'schedule-history')
      return {
        run(guard) {
          guard();
          current();
          return { firings: owner(() => deps.schedules.history(slug, text(args.id))) };
        },
      };
    const expectedState = text(args.expectedState);
    if (!/^[a-f0-9]{64}$/u.test(expectedState)) throw new TobError('invalid-input');
    if (command === 'schedule-create') {
      const operationKey = text(args.operationKey);
      if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/u.test(operationKey))
        throw new TobError('invalid-operation-key');
      const input = changes(args.input, true) as BotScheduleInput;
      const payloadHash = hash({ bot: selected, input });
      const recovered = () => {
        list();
        const id = owner(() => deps.schedules.creation(operationKey, payloadHash));
        if (!id) return undefined;
        const schedule = list().find((row) => row.id === id);
        if (!schedule) throw new TobError('schedule-creation-deleted');
        return { schedule: { ...schedule, stateFingerprint: state(schedule) }, operationKey };
      };
      if (recovered())
        return {
          run(guard) {
            guard();
            return recovered();
          },
        };
      owner(() => previewBotScheduleTrigger(input.trigger));
      const previous = collection();
      if (previous.stateFingerprint !== expectedState) throw new TobError('stale-schedule');
      return {
        proposal: freeze({
          command,
          target: slug,
          previousValue: previous,
          patch: { input, operationKey, expectedState },
        }),
        run(guard, beforeEffect) {
          guard();
          const replay = recovered();
          if (replay) return replay;
          if (collection().stateFingerprint !== expectedState) throw new TobError('stale-schedule');
          beforeEffect?.();
          const schedule = owner(() =>
            deps.schedules.create(slug, input, 'human', { operationKey, payloadHash }),
          );
          return { schedule: { ...schedule, stateFingerprint: state(schedule) }, operationKey };
        },
      };
    }
    if (command === 'schedule-delete' && args.confirm !== true)
      throw new TobError('confirmation-required');
    const change = command === 'schedule-update' ? changes(args.change, false) : undefined;
    const validate = () => {
      const schedule = current();
      if (state(schedule) !== expectedState) throw new TobError('stale-schedule');
      if (
        schedule.locked &&
        !(
          command === 'schedule-update' &&
          Object.keys(change!).length === 1 &&
          change!.locked === false
        )
      )
        throw new TobError('locked');
      return schedule;
    };
    const previous = validate();
    if (change?.trigger && JSON.stringify(change.trigger) !== JSON.stringify(previous.trigger))
      owner(() => previewBotScheduleTrigger(change.trigger!));
    return {
      proposal: freeze({
        command,
        target: slug + '/' + previous.id,
        previousValue: previous,
        patch: {
          expectedState,
          ...(change ? { changes: change } : {}),
          ...(command === 'schedule-delete' ? { confirm: true, deletesHistory: true } : {}),
        },
      }),
      run(guard, beforeEffect) {
        guard();
        validate();
        beforeEffect?.();
        if (command === 'schedule-delete')
          return { removed: owner(() => deps.schedules.remove(slug, previous.id, 'human')) };
        if (command === 'schedule-run-now')
          return { firing: owner(() => deps.schedules.runNow(slug, previous.id)) };
        const schedule = owner(() => deps.schedules.update(slug, previous.id, change!, 'human'));
        return { schedule: { ...schedule, stateFingerprint: state(schedule) } };
      },
    };
  };
}

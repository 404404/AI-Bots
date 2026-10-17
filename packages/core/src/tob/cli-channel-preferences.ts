import {
  ChannelPreferencesError,
  type ChannelPreferencesService,
} from '../channels/preferences.js';
import type { PrepareTobOperation, TobCliCapability } from './cli-operations.js';
import { TobError } from './service.js';

export const TOB_CHANNEL_PREFERENCES_CAPABILITIES: readonly TobCliCapability[] = [
  {
    command: 'channel-preferences',
    description:
      'Read the current Human’s Bot DM or Group preferences and state fingerprint, including hidden Channels',
    write: false,
  },
  {
    command: 'channel-mute',
    description: 'Set or clear the current Human’s Channel do-not-disturb preference',
    write: true,
  },
  {
    command: 'channel-pin',
    description:
      'Pin or unpin one Channel for the current Human, preserving other pins and their order',
    write: true,
  },
  {
    command: 'channel-hide',
    description:
      'Hide or restore one Channel in the current Human’s list without changing membership or deleting history',
    write: true,
  },
  {
    command: 'channel-human-name-set',
    description: 'Set or clear the Human’s own nickname in one Channel, not the Bot or Group name',
    write: true,
  },
];

function text(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value !== value.trim() ||
    value.length > 512 ||
    /[\u0000-\u001f\u007f]/u.test(value)
  )
    throw new TobError('invalid-input');
  return value;
}
function failure(error: unknown): never {
  if (error instanceof ChannelPreferencesError) throw new TobError(error.code);
  throw error;
}
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

export function createTobChannelPreferencesOperations(
  preferences: ChannelPreferencesService,
): PrepareTobOperation {
  const snapshot = (channelId: string) => {
    try {
      return preferences.snapshot(channelId);
    } catch (error) {
      return failure(error);
    }
  };
  return (command, raw) => {
    if (!TOB_CHANNEL_PREFERENCES_CAPABILITIES.some((entry) => entry.command === command))
      return undefined;
    const args = structuredClone(raw);
    const field =
      command === 'channel-mute'
        ? 'muted'
        : command === 'channel-pin'
          ? 'pinned'
          : command === 'channel-hide'
            ? 'hidden'
            : 'nickname';
    const read = command === 'channel-preferences';
    const allowed = read ? ['channelId'] : ['channelId', 'expectedState', field];
    if (Object.keys(args).some((key) => !allowed.includes(key)))
      throw new TobError('invalid-input');
    const channelId = text(args.channelId);
    if (read)
      return {
        run(guard) {
          guard();
          return snapshot(channelId);
        },
      };
    const expectedState = text(args.expectedState);
    if (!/^[a-f0-9]{64}$/u.test(expectedState)) throw new TobError('invalid-input');
    const value = args[field];
    if (field === 'nickname') {
      if (
        value !== null &&
        (typeof value !== 'string' ||
          !value.trim() ||
          value !== value.trim() ||
          value.length > 128 ||
          /[\u0000-\u001f\u007f]/u.test(value))
      )
        throw new TobError('invalid-input');
    } else if (typeof value !== 'boolean') throw new TobError('invalid-input');
    const previous = structuredClone(snapshot(channelId));
    if (previous.stateFingerprint !== expectedState)
      throw new TobError('stale-channel-preferences');
    const patch = { [field]: value };
    return {
      proposal: freeze({
        command,
        target: channelId,
        previousValue: previous,
        patch: { expectedState, changes: patch },
      }),
      async run(guard, beforeEffect) {
        try {
          return await preferences.update({ channelId, expectedState, patch }, guard, beforeEffect);
        } catch (error) {
          return failure(error);
        }
      },
    };
  };
}

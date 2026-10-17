import { createHash } from 'node:crypto';
import type { PersonaBotRegistry } from '../bots/registry.js';
import { OperationalDatabaseError } from '../database/owner.js';
import { RosterUnavailableError, type RosterStore } from '../roster/store.js';
import { isBotDmChannel, type ChannelRecord } from './channel.js';
import type { ChannelStore } from './store.js';

export interface ChannelPreferencesSnapshot {
  channel: Pick<ChannelRecord, 'id' | 'type' | 'name' | 'botSlug'>;
  scope: 'human-channel';
  humanId: string;
  pinned: boolean;
  hidden: boolean;
  muted: boolean;
  nickname: string | null;
  stateFingerprint: string;
}
export interface ChannelPreferencesUpdate {
  channelId: string;
  expectedState?: string;
  patch: { pinned?: boolean; hidden?: boolean; muted?: boolean; nickname?: string | null };
}
export interface ChannelPreferencesService {
  snapshot(channelId: string): ChannelPreferencesSnapshot;
  update(
    input: ChannelPreferencesUpdate,
    guard?: () => void,
    beforeEffect?: () => void,
  ): Promise<ChannelPreferencesSnapshot>;
  setHumanNickname(
    input: ChannelPreferencesUpdate,
    guard?: () => void,
    beforeEffect?: () => void,
  ): ChannelPreferencesSnapshot;
}
export class ChannelPreferencesError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'ChannelPreferencesError';
  }
}
class GuardRefusal extends Error {
  constructor(readonly refusal: unknown) {
    super('Channel preference write refused');
  }
}
export function createChannelPreferences(options: {
  channels: ChannelStore;
  registry: PersonaBotRegistry;
  roster: RosterStore;
}): ChannelPreferencesService {
  const { channels, registry, roster } = options;
  const target = (id: string) => {
    const channel = channels.get(id);
    if (!channel || channel.deletedAt) throw new ChannelPreferencesError('unknown-channel');
    if (isBotDmChannel(channel) || (channel.type === 'dm' && !channel.botSlug))
      throw new ChannelPreferencesError('unsupported-channel');
    const nickname = channels.humanNickname(id);
    if (nickname === undefined) throw new ChannelPreferencesError('channel-access-denied');
    const bot = channel.botSlug ? registry.get(channel.botSlug) : undefined;
    if (channel.type === 'dm' && !bot) throw new ChannelPreferencesError('unknown-bot');
    return { channel, nickname, bot };
  };
  const resolvePin = (pin: string) => {
    const channel = channels.get(pin);
    if (channel && !channel.deletedAt) return pin;
    return (
      channels.list().find((candidate) => candidate.type === 'dm' && candidate.botSlug === pin)
        ?.id ?? pin
    );
  };
  const snapshot = (channelId: string): ChannelPreferencesSnapshot => {
    try {
      const { channel, nickname, bot } = target(channelId);
      const arrangement = roster.snapshot();
      const humanId = channels.humanIdentity().humanId;
      const state = {
        pinned: arrangement.pins.some((pin) => resolvePin(pin) === channelId),
        hidden: arrangement.hidden.includes(channelId),
        muted: arrangement.muted.includes(channelId),
        nickname,
      };
      const stateFingerprint = createHash('sha256')
        .update(
          JSON.stringify({
            scope: 'human-channel',
            humanId,
            channelId,
            type: channel.type,
            createdAt: channel.createdAt,
            botSlug: channel.botSlug,
            botCreatedAt: bot?.createdAt,
            ...state,
          }),
        )
        .digest('hex');
      return {
        channel: {
          id: channel.id,
          type: channel.type,
          name: channel.name,
          ...(channel.botSlug ? { botSlug: channel.botSlug } : {}),
        },
        scope: 'human-channel',
        humanId,
        ...state,
        stateFingerprint,
      };
    } catch (error) {
      if (error instanceof RosterUnavailableError || error instanceof OperationalDatabaseError)
        throw new ChannelPreferencesError('preferences-unavailable');
      throw error;
    }
  };
  const validate = (input: ChannelPreferencesUpdate) => {
    if (
      !input ||
      typeof input.channelId !== 'string' ||
      !input.channelId.trim() ||
      Object.keys(input).some((key) => !['channelId', 'expectedState', 'patch'].includes(key)) ||
      (input.expectedState !== undefined && !/^[a-f0-9]{64}$/u.test(input.expectedState)) ||
      !input.patch ||
      Object.keys(input.patch).length !== 1
    )
      throw new ChannelPreferencesError('invalid-input');
    const [field] = Object.keys(input.patch);
    if (field === 'nickname') {
      const value = input.patch.nickname;
      if (
        value !== null &&
        (typeof value !== 'string' || value.length > 128 || /[\u0000-\u001f\u007f]/u.test(value))
      )
        throw new ChannelPreferencesError('invalid-input');
    } else if (
      !['pinned', 'hidden', 'muted'].includes(field!) ||
      typeof input.patch[field as 'pinned'] !== 'boolean'
    )
      throw new ChannelPreferencesError('invalid-input');
  };
  const check = (
    input: ChannelPreferencesUpdate,
    guard?: () => void,
    beforeEffect?: () => void,
  ) => {
    guard?.();
    const current = snapshot(input.channelId);
    if (input.expectedState !== undefined && current.stateFingerprint !== input.expectedState)
      throw new ChannelPreferencesError('stale-channel-preferences');
    beforeEffect?.();
  };
  const setHumanNickname: ChannelPreferencesService['setHumanNickname'] = (
    input,
    guard,
    beforeEffect,
  ) => {
    validate(input);
    if (!Object.hasOwn(input.patch, 'nickname')) throw new ChannelPreferencesError('invalid-input');
    check(input, guard, beforeEffect);
    try {
      channels.setHumanNickname(input.channelId, input.patch.nickname!, () => {
        try {
          check(input, guard);
        } catch (error) {
          throw new GuardRefusal(error);
        }
      });
    } catch (error) {
      if (error instanceof OperationalDatabaseError && error.cause instanceof GuardRefusal)
        throw error.cause.refusal;
      if (error instanceof OperationalDatabaseError)
        throw new ChannelPreferencesError('preferences-unavailable');
      throw error;
    }
    return snapshot(input.channelId);
  };
  return {
    snapshot,
    setHumanNickname,
    async update(input, guard, beforeEffect) {
      validate(input);
      if (Object.hasOwn(input.patch, 'nickname'))
        return setHumanNickname(input, guard, beforeEffect);
      const field = Object.keys(input.patch)[0] as 'pinned' | 'hidden' | 'muted';
      try {
        await roster.channelPreferenceSet(
          input.channelId,
          field,
          input.patch[field]!,
          () => check(input, guard),
          resolvePin,
          () => check(input, guard, beforeEffect),
        );
      } catch (error) {
        if (error instanceof RosterUnavailableError)
          throw new ChannelPreferencesError('preferences-unavailable');
        throw error;
      }
      return snapshot(input.channelId);
    },
  };
}

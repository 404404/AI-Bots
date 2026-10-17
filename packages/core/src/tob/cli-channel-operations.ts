import { isDeepStrictEqual } from 'node:util';
import type { PersonaBotRegistry } from '../bots/registry.js';
import { botProfileFingerprint } from '../bots/profile-snapshot.js';
import type { ChannelRecord } from '../channels/channel.js';
import type { ChannelStore } from '../channels/store.js';
import { ChannelManagementError, type ChannelManagementService } from '../channels/management.js';
import type { PrepareTobOperation, TobCliCapability } from './cli-operations.js';
import { TobError } from './service.js';

export const TOB_CHANNEL_CAPABILITIES: readonly TobCliCapability[] = [
  {
    command: 'channels',
    description: 'List bounded Channel metadata without reading conversation content',
    write: false,
  },
  {
    command: 'channel',
    description:
      'Read a Group Channel and its current management fingerprint and invitation policy',
    write: false,
  },
  {
    command: 'group-create',
    description:
      'Create a Human-owned Group; explicitly selected initial Bots join directly, and Tob never joins',
    write: true,
  },
  {
    command: 'group-invite',
    description:
      'Invite one active Bot under the reviewed Group invitation policy; preserve the canonical acceptance outcome',
    write: true,
  },
];

function keys(value: Record<string, unknown>, allowed: string[]) {
  if (Object.keys(value).some((key) => !allowed.includes(key))) throw new TobError('invalid-input');
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
function key(value: unknown): string {
  const result = text(value);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/u.test(result))
    throw new TobError('invalid-operation-key');
  return result;
}
function owner<T>(call: () => T): T {
  try {
    return call();
  } catch (error) {
    if (error instanceof ChannelManagementError) throw new TobError(error.code);
    throw error;
  }
}
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const item of Object.values(value)) freeze(item);
    Object.freeze(value);
  }
  return value;
}
function channelView(channel: ChannelRecord) {
  const invitations = channel.invitations ?? [];
  return {
    id: channel.id,
    type: channel.type,
    name: channel.name,
    members: channel.members.slice(0, 100),
    memberCount: channel.members.length,
    ...(channel.members.length > 100 ? { membersOmitted: channel.members.length - 100 } : {}),
    ...(channel.botSlug === undefined ? {} : { botSlug: channel.botSlug }),
    ...(channel.ownerBotSlug === undefined ? {} : { ownerBotSlug: channel.ownerBotSlug }),
    invitations: invitations.slice(-100).map((invitation) => ({ ...invitation })),
    ...(invitations.length > 100 ? { invitationsOmitted: invitations.length - 100 } : {}),
    createdAt: channel.createdAt,
    updatedAt: channel.updatedAt,
  };
}
function view(value: ReturnType<ChannelManagementService['snapshot']>) {
  return { ...value, channel: channelView(value.channel) };
}

export function createTobChannelOperations(deps: {
  management: ChannelManagementService;
  channels: Pick<ChannelStore, 'list'>;
  registry: Pick<PersonaBotRegistry, 'get'>;
  isProtectedBot(slug: string): boolean;
}): PrepareTobOperation {
  const bot = (slug: string) => {
    if (deps.isProtectedBot(slug)) throw new TobError('protected-bot');
    const record = deps.registry.get(slug);
    if (!record) throw new TobError('unknown-bot');
    if (record.paused) throw new TobError('archived-bot');
    return {
      slug,
      displayName: record.displayName,
      createdAt: record.createdAt,
      profileFingerprint: botProfileFingerprint(record),
    };
  };
  return (command, raw) => {
    if (!TOB_CHANNEL_CAPABILITIES.some((item) => item.command === command)) return undefined;
    const args = structuredClone(raw);
    if (command === 'channels') {
      keys(args, ['limit', 'cursor']);
      const limit = args.limit === undefined ? 50 : args.limit;
      if (typeof limit !== 'number' || !Number.isInteger(limit) || limit < 1 || limit > 100)
        throw new TobError('invalid-input');
      const cursor = args.cursor === undefined ? undefined : text(args.cursor);
      return {
        run(guard) {
          guard();
          const channels = deps.channels
            .list()
            .filter(
              (channel) =>
                !channel.deletedAt && (channel.type === 'group' || channel.botSlug !== undefined),
            )
            .sort((a, b) => a.id.localeCompare(b.id));
          const after =
            cursor === undefined
              ? channels
              : channels.filter((channel) => channel.id.localeCompare(cursor) > 0);
          const page = after.slice(0, limit);
          return {
            channels: page.map(channelView),
            ...(after.length > limit ? { nextCursor: page.at(-1)!.id } : {}),
          };
        },
      };
    }
    if (command === 'channel') {
      keys(args, ['channelId']);
      const channelId = text(args.channelId);
      return {
        run(guard) {
          guard();
          return view(owner(() => deps.management.snapshot(channelId)));
        },
      };
    }
    keys(
      args,
      command === 'group-create'
        ? ['name', 'members', 'operationKey']
        : ['channelId', 'botSlug', 'expectedChannel', 'operationKey'],
    );
    const operationKey = key(args.operationKey);
    if (command === 'group-create') {
      const name = text(args.name);
      if (!Array.isArray(args.members) || args.members.length > 100)
        throw new TobError('invalid-input');
      const members = args.members.map(text);
      if (new Set(members).size !== members.length) throw new TobError('invalid-input');
      const input = { name, members };
      const lookup = () => owner(() => deps.management.lookupCreate(operationKey, input));
      if (lookup())
        return {
          run(guard) {
            guard();
            const replay = lookup();
            if (!replay) throw new TobError('channel-outcome-uncertain');
            return view(replay);
          },
        };
      const targets = members.map(bot);
      return {
        proposal: freeze({
          command,
          target: operationKey,
          previousValue: null,
          patch: { name, initialMembership: 'join-directly', members: targets },
        }),
        run(guard, beforeEffect) {
          guard();
          if (!isDeepStrictEqual(members.map(bot), targets)) throw new TobError('stale-profile');
          const replay = lookup();
          if (replay) return view(replay);
          beforeEffect?.();
          return view(owner(() => deps.management.create(input, operationKey)));
        },
      };
    }
    const channelId = text(args.channelId),
      botSlug = text(args.botSlug),
      expectedChannel = text(args.expectedChannel);
    if (!/^[a-f0-9]{64}$/u.test(expectedChannel)) throw new TobError('invalid-input');
    const input = { channelId, botSlug, expectedChannel };
    const lookup = () => owner(() => deps.management.lookupInvite(operationKey, input));
    if (lookup())
      return {
        run(guard) {
          guard();
          const replay = lookup();
          if (!replay) throw new TobError('channel-outcome-uncertain');
          return view(replay);
        },
      };
    const previous = structuredClone(owner(() => deps.management.snapshot(channelId)));
    if (previous.channelFingerprint !== expectedChannel) throw new TobError('stale-channel');
    const targetBot = bot(botSlug);
    return {
      proposal: freeze({
        command,
        target: channelId,
        previousValue: view(previous),
        patch: {
          operationKey,
          expectedChannel,
          invite: targetBot,
          invitationPolicy: previous.invitationPolicy,
        },
      }),
      run(guard, beforeEffect) {
        guard();
        const replay = lookup();
        if (replay) return view(replay);
        if (!isDeepStrictEqual(bot(botSlug), targetBot)) throw new TobError('stale-profile');
        if (owner(() => deps.management.snapshot(channelId)).channelFingerprint !== expectedChannel)
          throw new TobError('stale-channel');
        beforeEffect?.();
        return view(owner(() => deps.management.invite(input, operationKey)));
      },
    };
  };
}

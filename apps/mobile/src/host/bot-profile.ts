import type { HostClient, RosterChannel, RosterView } from './client';
import type { BotScheduleSummary, MemoryFile, MemorySnapshot, WorkspaceGrantSummary } from './wire';

export type ProfilePart<T> = { status: 'ready'; value: T } | { status: 'failed'; error: string };

export interface ProfileMemory {
  core?: string;
  files: string[];
}

export interface BotProfile {
  identity: ProfilePart<string | undefined>;
  memory: ProfilePart<ProfileMemory>;
  routines: ProfilePart<BotScheduleSummary[]>;
  files: ProfilePart<WorkspaceGrantSummary[]>;
}

const SOUL = 'SOUL.md';
const CORE_MEMORY = 'MEMORY.md';

function settle<T>(work: Promise<T>): Promise<ProfilePart<T>> {
  return work.then(
    (value) => ({ status: 'ready', value }),
    (error: unknown) => ({
      status: 'failed',
      error: error instanceof Error ? error.message : String(error),
    }),
  );
}

export async function loadBotProfile(
  client: HostClient,
  bot: { slug: string; displayName?: string; dmChannelId?: string },
): Promise<BotProfile> {
  const channel =
    bot.dmChannelId !== undefined
      ? Promise.resolve(bot.dmChannelId)
      : client
          .call<{ channel: { id: string } }>('channelDm', {
            slug: bot.slug,
            ...(bot.displayName === undefined ? {} : { displayName: bot.displayName }),
          })
          .then((result) => result.channel.id);
  const snapshot = channel.then(async (channelId) => ({
    channelId,
    snapshot: (await client.call<{ snapshot: MemorySnapshot }>('memorySnapshot', { channelId }))
      .snapshot,
  }));
  const read = async (role: 'soul' | 'coreMemory', fallback: string) => {
    const { channelId, snapshot: current } = await snapshot;
    const path = current.standing.find((entry) => entry.role === role)?.path ?? fallback;
    if (!current.files.includes(path)) return undefined;
    const { file } = await client.call<{ file?: MemoryFile }>('memoryFile', { channelId, path });
    return file === undefined || file.binary === true || file.body.trim() === ''
      ? undefined
      : file.body.trim();
  };
  const [identity, memory, routines, files] = await Promise.all([
    settle(read('soul', SOUL)),
    settle(
      Promise.all([read('coreMemory', CORE_MEMORY), snapshot]).then(
        ([core, { snapshot: current }]): ProfileMemory => ({
          ...(core === undefined ? {} : { core }),
          files: [...current.files].sort((a, b) => a.localeCompare(b)),
        }),
      ),
    ),
    settle(
      client
        .call<{ schedules: BotScheduleSummary[] }>('scheduleList', { slug: bot.slug })
        .then((result) => result.schedules),
    ),
    settle(
      client
        .call<{ grants: WorkspaceGrantSummary[] }>('grants', { slug: bot.slug })
        .then((result) => result.grants.filter((grant) => grant.revokedAt === undefined)),
    ),
  ]);
  return { identity, memory, routines, files };
}

export function botChannels(roster: RosterView | undefined, slug: string): RosterChannel[] {
  return roster?.channels.filter((channel) => channel.members.includes(slug)) ?? [];
}

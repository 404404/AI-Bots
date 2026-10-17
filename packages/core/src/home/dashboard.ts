import type { BridgeMethodsDeps } from '../bridge/methods.js';
import { isBotDmChannel, LOCAL_HUMAN_ID } from '../channels/channel.js';
import type { HumanAttentionItem } from '../runtime/human-attention.js';
import type { RollingUsageRange, RollingUsageResult } from '../usage/usage.js';

export type HomeFact<T> = { status: 'ready'; value: T } | { status: 'unavailable' };
export interface HomeDashboard {
  readAt: string;
  attention: HomeFact<{
    unreadCount: number;
    actionCount: number;
    items: HumanAttentionItem[];
    hasMore: boolean;
  }>;
  working: HomeFact<
    Array<{
      slug: string;
      displayName: string;
      sessions: Array<{ sessionId: string; role: 'orchestrator' | 'assignment'; purpose?: string }>;
    }>
  >;
  usage: HomeFact<RollingUsageResult>;
  recent: HomeFact<
    Array<
      | { kind: 'channel'; channelId: string; messageId: string; label: string; at: string }
      | { kind: 'assignment'; botSlug: string; sessionId: string; label: string; at: string }
    >
  >;
}

function fact<T>(query: () => T): HomeFact<T> {
  try {
    return { status: 'ready', value: query() };
  } catch {
    return { status: 'unavailable' };
  }
}

export async function queryHomeDashboard(
  deps: BridgeMethodsDeps,
  range: RollingUsageRange,
): Promise<HomeDashboard> {
  const readAt = new Date().toISOString();
  const attention = fact(() => {
    if (!deps.humanAttention) throw new Error('attention-unavailable');
    const page = deps.humanAttention.list({ category: 'action', sort: 'newest', limit: 5 });
    return {
      unreadCount: deps.humanAttention.status().unreadCount,
      actionCount: deps.humanAttention.actionCount(),
      items: page.items,
      hasMore: page.nextCursor !== undefined,
    };
  });
  const working = fact(() => {
    if (!deps.runtime || !deps.runningSessionIds) throw new Error('runtime-unavailable');
    const running = deps.runningSessionIds();
    return deps.registry.list().flatMap((bot) => {
      const states = deps.states.snapshot(bot.slug).sessions;
      const assignments = new Map(
        deps.runtime!.listAssignments(bot.slug).map((row) => [row.sessionId, row]),
      );
      const sessions = deps.ownership.rootsFor(bot.slug).flatMap((root) => {
        if (
          root.parentSessionId ||
          !running.has(root.sessionId) ||
          (states[root.sessionId] !== 'thinking' && states[root.sessionId] !== 'working')
        )
          return [];
        const purpose = assignments.get(root.sessionId)?.purpose;
        return [
          { sessionId: root.sessionId, role: root.rootRole, ...(purpose ? { purpose } : {}) },
        ];
      });
      return sessions.length ? [{ slug: bot.slug, displayName: bot.displayName, sessions }] : [];
    });
  });
  const recent = fact(() => {
    if (!deps.runtime) throw new Error('runtime-unavailable');
    const items: Extract<HomeDashboard['recent'], { status: 'ready' }>['value'] = [];
    for (const channel of deps.channels.list()) {
      if (
        channel.deletedAt ||
        isBotDmChannel(channel) ||
        !deps.channels
          .listHumanMembers(channel.id)
          .some((human) => human.humanId === LOCAL_HUMAN_ID)
      )
        continue;
      const message = deps.channels.queryMessages(channel.id, { orderBy: 'time', limit: 1 })
        .messages[0];
      if (!message || !Number.isFinite(Date.parse(message.at))) continue;
      items.push({
        kind: 'channel',
        channelId: channel.id,
        messageId: message.id,
        label:
          channel.type === 'dm' && channel.botSlug
            ? (deps.registry.get(channel.botSlug)?.displayName ?? channel.name)
            : channel.name,
        at: message.at,
      });
    }
    for (const bot of deps.registry.list()) {
      for (const task of deps.runtime.listAssignments(bot.slug)) {
        const owner = deps.ownership.resolve(task.sessionId);
        if (
          task.archivedAt ||
          owner?.botSlug !== bot.slug ||
          !Number.isFinite(Date.parse(task.updatedAt))
        )
          continue;
        items.push({
          kind: 'assignment',
          botSlug: bot.slug,
          sessionId: task.sessionId,
          label: task.purpose,
          at: task.updatedAt,
        });
      }
    }
    return items
      .sort((a, b) => Date.parse(b.at) - Date.parse(a.at) || a.label.localeCompare(b.label))
      .slice(0, 8);
  });
  let usage: HomeDashboard['usage'] = { status: 'unavailable' };
  if (deps.usage) {
    try {
      usage = { status: 'ready', value: deps.usage.rolling(range) };
    } catch {
      usage = { status: 'unavailable' };
    }
  }
  return { readAt, attention, working, usage, recent };
}

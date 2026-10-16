import type { HostClient } from './client';
import type { HumanAttentionItem, HumanAttentionPage } from './wire';

export const INBOX_SECTIONS = ['action', 'replies', 'unread', 'handled'] as const;
export type InboxSection = (typeof INBOX_SECTIONS)[number];

interface UnreadCounts {
  channels: Array<{ channelId: string; unreadCount: number }>;
}

const LIMITS: Record<InboxSection, number> = { action: 100, replies: 30, unread: 30, handled: 30 };

export type InboxSnapshot =
  | { status: 'idle' }
  | { status: 'loading' }
  | {
      status: 'ready';
      botSlug?: string;
      sections: Record<InboxSection, HumanAttentionItem[]>;
      unread?: Readonly<Record<string, number>>;
      stale?: string;
    }
  | { status: 'error'; error: string };

export interface Inbox {
  getSnapshot(): InboxSnapshot;
  subscribe(listener: () => void): () => void;
  refresh(): Promise<void>;
  find(id: string): HumanAttentionItem | undefined;
  stop(): void;
}

export function createInbox(client: HostClient, options: { botSlug?: string } = {}): Inbox {
  const listeners = new Set<() => void>();
  let snapshot: InboxSnapshot = { status: 'idle' };
  let reading: Promise<void> | undefined;
  let readAgain = false;
  let stopped = false;

  const publish = (next: InboxSnapshot): void => {
    snapshot = next;
    for (const listener of listeners) listener();
  };

  const readOnce = async (): Promise<void> => {
    const [pages, counts] = await Promise.all([
      Promise.all(
        INBOX_SECTIONS.map((category) =>
          client.call<HumanAttentionPage>('humanAttention', {
            category,
            limit: LIMITS[category],
            ...options,
          }),
        ),
      ),
      client.call<UnreadCounts>('channelUnreadCounts').catch(() => ({ channels: [] })),
    ]);
    const unread = Object.fromEntries(
      counts.channels.map((entry) => [entry.channelId, entry.unreadCount]),
    );
    if (stopped) return;
    const [action, replies, otherUnread, handled] = pages.map((page) => page.items) as [
      HumanAttentionItem[],
      HumanAttentionItem[],
      HumanAttentionItem[],
      HumanAttentionItem[],
    ];
    publish({
      status: 'ready',
      ...options,
      sections: { action, replies, unread: otherUnread, handled },
      unread,
    });
  };

  const refresh = (): Promise<void> => {
    if (reading !== undefined) {
      readAgain = true;
      return reading;
    }
    if (snapshot.status === 'idle' || snapshot.status === 'error') publish({ status: 'loading' });
    reading = (async () => {
      try {
        do {
          readAgain = false;
          await readOnce();
        } while (readAgain && !stopped);
      } catch (error) {
        if (stopped) return;
        const message = error instanceof Error ? error.message : String(error);
        publish(
          snapshot.status === 'ready'
            ? { ...snapshot, stale: message }
            : { status: 'error', error: message },
        );
      } finally {
        reading = undefined;
      }
    })();
    return reading;
  };

  const background = (): void => {
    if (client.getSnapshot().connection.status === 'connected') void refresh();
  };

  let wasConnected = false;
  const offClient = client.subscribe(() => {
    const connected = client.getSnapshot().connection.status === 'connected';
    if (connected && !wasConnected) background();
    wasConnected = connected;
  });
  const offLive = client.onLive(background);
  background();
  wasConnected = client.getSnapshot().connection.status === 'connected';

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    refresh,
    find(id) {
      if (snapshot.status !== 'ready') return undefined;
      for (const section of INBOX_SECTIONS) {
        const item = snapshot.sections[section].find((entry) => entry.id === id);
        if (item !== undefined) return item;
      }
      return undefined;
    },
    stop() {
      stopped = true;
      offClient();
      offLive();
    },
  };
}

export function actionCount(snapshot: InboxSnapshot): number {
  return snapshot.status === 'ready' ? snapshot.sections.action.length : 0;
}

export function observeInbox(client: HostClient, botSlug: string) {
  const loading: InboxSnapshot = { status: 'loading' };
  let inbox: Inbox | undefined;
  let watchers = 0;
  return {
    getSnapshot: () => inbox?.getSnapshot() ?? loading,
    getInbox: () => inbox,
    subscribe(listener: () => void) {
      inbox ??= createInbox(client, { botSlug });
      watchers += 1;
      const off = inbox.subscribe(listener);
      return () => {
        off();
        watchers -= 1;
        if (watchers !== 0) return;
        inbox?.stop();
        inbox = undefined;
      };
    },
  };
}

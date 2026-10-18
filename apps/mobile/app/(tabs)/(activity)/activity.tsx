import { Stack, useIsFocused, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useMemo } from 'react';

import { useHostSession, useHostSnapshot, useInbox } from '../../../src/host/host-session';
import { cardHref, unreadHref } from '../../../src/host/push';
import type { HumanAttentionItem } from '../../../src/host/wire';
import { useDesignTheme } from '../../../src/ui/design/theme';
import { ConnectionBanner } from '../../../src/ui/connection-banner';
import { ActivityFeed } from '../../../src/ui/shell/activity-feed';
import { HostDrawerEdge } from '../../../src/ui/shell/host-drawer';
import { t } from '../../../src/ui/strings';

export default function ActivityScreen() {
  const router = useRouter();
  const focused = useIsFocused();
  const theme = useDesignTheme();
  const { saved, client, inbox } = useHostSession();
  const snapshot = useHostSnapshot(client, focused);
  const list = useInbox(inbox, focused);
  const roster = snapshot.roster;
  const botSlugs = useMemo(() => roster?.bots.map((bot) => bot.slug) ?? [], [roster]);
  const channels = useMemo(
    () => [
      ...(roster?.bots.flatMap((bot) =>
        bot.dmChannelId ? [{ id: bot.dmChannelId, name: bot.displayName }] : [],
      ) ?? []),
      ...(roster?.channels.map((channel) => ({ id: channel.id, name: channel.name })) ?? []),
    ],
    [roster],
  );
  const bot = useCallback(
    (slug: string) => roster?.bots.find((entry) => entry.slug === slug),
    [roster],
  );

  const open = useCallback(
    (item: HumanAttentionItem) => {
      const unread = unreadHref(
        item,
        (slug) => bot(slug)?.dmChannelId,
        (channelId) => roster?.channels.some((channel) => channel.id === channelId) ?? false,
      );
      if (unread !== undefined) return router.push(unread);
      const card = cardHref(
        item,
        (slug) => bot(slug)?.dmChannelId,
        (channelId) => roster?.channels.some((channel) => channel.id === channelId) ?? false,
      );
      if (card !== undefined) return router.push(card);
      router.push({
        pathname: '/inbox/[id]',
        params: {
          id: item.id,
          kind: item.kind,
          botSlug: item.botSlug,
          summary: item.summary,
          ...(item.channelId === undefined ? {} : { channelId: item.channelId }),
          ...(item.messageId === undefined ? {} : { messageId: item.messageId }),
        },
      });
    },
    [router, bot, roster],
  );
  const header = useMemo(
    () => (
      <ConnectionBanner
        connection={snapshot.connection}
        onRetry={() => client?.retryNow()}
        onPairAgain={() => router.push('/pair')}
      />
    ),
    [snapshot.connection, client, router],
  );

  return (
    <>
      {focused ? <StatusBar style={theme.scheme === 'dark' ? 'light' : 'dark'} /> : null}
      <Stack.Screen options={{ title: t.activity, headerShown: false }} />
      <HostDrawerEdge>
        <ActivityFeed
          key={saved?.hostId ?? 'no-host'}
          hostId={saved?.hostId ?? ''}
          client={client}
          inbox={inbox}
          snapshot={list}
          botSlugs={botSlugs}
          channels={channels}
          bot={bot}
          onOpen={open}
          header={header}
        />
      </HostDrawerEdge>
    </>
  );
}

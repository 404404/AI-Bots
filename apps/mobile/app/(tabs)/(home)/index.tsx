import { renderKeyboardFormScroll } from '../../../src/ui/primitives/keyboard-form';
import { Redirect, Stack, useFocusEffect, useIsFocused, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { fullClientParams } from '../../../src/host/full-client';
import { useHostSession, useHostSnapshot, useInbox } from '../../../src/host/host-session';
import { useHostLook } from '../../../src/host/native-host-look';
import { cloudClient, useCloudSnapshot } from '../../../src/cloud/native';
import { cloudConversations, useCloudConversations } from '../../../src/cloud/native-conversations';
import { cloudViewScope } from '../../../src/cloud/workspace-directory';
import { cloudError } from '../../../src/cloud/client';
import type { CloudConversation } from '../../../src/cloud/conversations';
import { ConversationRow } from '../../../src/ui/chat/conversation-row';
import { conversations, type Conversation } from '../../../src/ui/chat/conversations';
import { SourceName } from '../../../src/ui/chat/source-name';
import { ConnectionBanner } from '../../../src/ui/connection-banner';
import { space } from '../../../src/ui/design/tokens';
import { useDesignTheme } from '../../../src/ui/design/theme';
import { SearchField } from '../../../src/ui/primitives/search-field';
import { Chip } from '../../../src/ui/primitives/chip';
import { Text } from '../../../src/ui/primitives/text';
import { CreateButton, type CreateTarget } from '../../../src/ui/shell/create-button';
import { HomeHeader } from '../../../src/ui/shell/home-header';
import { HostDrawerEdge } from '../../../src/ui/shell/host-drawer';
import { SettingsButton } from '../../../src/ui/shell/settings-button';
import { useFloatingTabInset } from '../../../src/ui/shell/floating-tab-inset';
import { openConversation } from '../../../src/ui/shell/open-conversation';
import { useChromeScroll } from '../../../src/ui/shell/scroll-chrome';
import { t } from '../../../src/ui/strings';

type Row =
  | { key: string; type: 'computer'; conversation: Conversation; pinned: boolean; at?: string }
  | { key: string; type: 'cloud'; conversation: CloudConversation; pinned: false; at?: string };
export default function HomeScreen() {
  const router = useRouter();
  const focused = useIsFocused();
  const onScroll = useChromeScroll(focused);
  const bottom = useFloatingTabInset();
  const theme = useDesignTheme();
  const { saved, client, inbox } = useHostSession();
  const look = useHostLook(saved?.hostId);
  const snapshot = useHostSnapshot(client, focused);
  const list = useInbox(inbox, focused);
  const cloud = useCloudSnapshot();
  const directory = useCloudConversations();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [refreshing, setRefreshing] = useState(false);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string>();
  const enrollment = JSON.stringify(cloud.rows.map(cloudViewScope));
  useFocusEffect(
    useCallback(() => {
      if (cloud.ready) void cloudConversations.refresh();
    }, [cloud.ready, enrollment]),
  );
  const filters = useMemo(() => {
    const choices = new Map<string, string>([['all', t.allConversations]]);
    if (saved) choices.set('computer', saved.hostName);
    for (const row of directory.rows)
      choices.set(JSON.stringify([row.scope, row.organizationId]), row.organizationName);
    return [...choices].map(([key, label]) => ({ key, label }));
  }, [saved, directory.rows]);
  const effectiveFilter = filters.some((f) => f.key === filter) ? filter : 'all';
  const rows = useMemo(() => {
    const pins = new Set(snapshot.roster?.arrangement?.pins);
    const hostRows: Row[] =
      effectiveFilter === 'all' || effectiveFilter === 'computer'
        ? conversations(
            snapshot.roster,
            list.status === 'ready' ? list.sections.action : [],
            list.status === 'ready' ? list.unread : {},
          ).map((conversation) => ({
            key: JSON.stringify(['computer', saved?.hostId, conversation.key]),
            type: 'computer',
            conversation,
            pinned:
              pins.has(
                conversation.kind === 'bot' ? conversation.bot.slug : conversation.channel.id,
              ) ||
              pins.has(
                conversation.kind === 'bot'
                  ? (conversation.bot.dmChannelId ?? '')
                  : conversation.channel.id,
              ),
            ...(conversation.at ? { at: conversation.at } : {}),
          }))
        : [];
    const cloudRows: Row[] = directory.rows
      .filter(
        (r) =>
          effectiveFilter === 'all' ||
          effectiveFilter === JSON.stringify([r.scope, r.organizationId]),
      )
      .map((conversation) => ({
        key: conversation.key,
        type: 'cloud',
        conversation,
        pinned: false,
      }));
    const needle = query.trim().toLocaleLowerCase();
    return [...hostRows, ...cloudRows]
      .filter(
        (r) =>
          !needle ||
          (r.type === 'cloud'
            ? r.conversation.channel.name
            : r.conversation.kind === 'bot'
              ? r.conversation.bot.displayName
              : r.conversation.channel.name
          )
            .toLocaleLowerCase()
            .includes(needle),
      )
      .sort(
        (a, b) =>
          Number(b.pinned) - Number(a.pinned) ||
          (Date.parse(b.at ?? '') || 0) - (Date.parse(a.at ?? '') || 0) ||
          a.key.localeCompare(b.key),
      );
  }, [snapshot.roster, list, directory.rows, saved?.hostId, effectiveFilter, query]);
  if (saved === undefined || !cloud.ready)
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  if (saved === null && cloud.rows.length === 0) return <Redirect href="/cloud-join" />;
  const create = (target: CreateTarget) =>
    router.push({ pathname: '/full-client', params: fullClientParams(target) });
  const refresh = async () => {
    setRefreshing(true);
    await Promise.all([client?.refresh(), inbox?.refresh(), cloudConversations.refresh()]).catch(
      () => undefined,
    );
    setRefreshing(false);
  };
  const openCloud = async (target: CloudConversation) => {
    if (opening || cloud.busy || directory.busy) return;
    setOpening(true);
    setError(undefined);
    try {
      let current = cloudClient
        .getSnapshot()
        .rows.find((r) => r.config.instanceId === target.instanceId);
      if (cloudViewScope(current) !== target.scope) throw Error('changed source');
      if (!current?.identity) await cloudClient.whoami(target.instanceId);
      current = cloudClient
        .getSnapshot()
        .rows.find((r) => r.config.instanceId === target.instanceId);
      if (!target.guest && current?.organization?.organizationId !== target.organizationId)
        await cloudClient.useOrganization(target.instanceId, target.organizationId);
      if (
        cloudViewScope(
          cloudClient.getSnapshot().rows.find((r) => r.config.instanceId === target.instanceId),
        ) !== target.scope
      )
        throw Error('changed source');
      router.push({
        pathname: '/cloud-channels',
        params: {
          instanceId: target.instanceId,
          organizationId: target.organizationId,
          channelId: target.channel.channelId,
          guest: String(target.guest),
          accountScope: target.scope,
        },
      });
    } catch (e) {
      setError(cloudError(e));
    } finally {
      setOpening(false);
    }
  };
  return (
    <>
      <Stack.Screen options={{ title: t.allConversations, headerShown: false }} />
      <HostDrawerEdge>
        <HomeHeader
          hostName={t.allConversations}
          look={look}
          actions={<SettingsButton onPress={() => router.push('/settings')} />}
        >
          <Animated.FlatList<Row>
            renderScrollComponent={renderKeyboardFormScroll}
            onScroll={onScroll}
            scrollEventThrottle={1}
            contentContainerStyle={{ paddingBottom: bottom + space.x6 }}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            data={rows}
            keyExtractor={(r) => r.key}
            refreshControl={
              <RefreshControl
                refreshing={refreshing || directory.busy}
                onRefresh={() => void refresh()}
              />
            }
            ListHeaderComponent={
              <>
                {saved && (
                  <ConnectionBanner
                    connection={snapshot.connection}
                    onRetry={() => client?.retryNow()}
                    onPairAgain={() => router.push('/pair')}
                  />
                )}
                <SearchField
                  inset={space.x5}
                  value={query}
                  placeholder={t.searchPlaceholder}
                  onChangeText={setQuery}
                  trailing={saved ? <CreateButton onPick={create} /> : undefined}
                />
                <ScrollView
                  horizontal
                  contentContainerStyle={{
                    paddingHorizontal: space.x5,
                    paddingVertical: space.x3,
                    gap: space.x2,
                  }}
                  showsHorizontalScrollIndicator={false}
                >
                  {filters.map((f) => (
                    <Chip
                      key={f.key}
                      label={f.label}
                      selected={effectiveFilter === f.key}
                      onPress={() => setFilter(f.key)}
                    />
                  ))}
                </ScrollView>
                {(directory.errors.length > 0 || error) && (
                  <Text tone="muted" style={{ paddingHorizontal: space.x5 }}>
                    {t.cloudListUnavailable}
                    {error ? ` (${error})` : ''}
                  </Text>
                )}
              </>
            }
            ListEmptyComponent={
              directory.busy ? (
                <ActivityIndicator />
              ) : (
                <Text tone="muted" style={{ padding: space.x6 }}>
                  {query ? t.searchNoMatch(query.trim()) : t.cloudChannels.empty}
                </Text>
              )
            }
            renderItem={({ item }) =>
              item.type === 'computer' ? (
                <ConversationRow
                  row={item.conversation}
                  now={new Date()}
                  onPress={() => openConversation(router, item.conversation, saved?.hostId)}
                />
              ) : (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${item.conversation.channel.name}, ${t.cloudChannels.cloudChannel}`}
                  disabled={opening || cloud.busy || directory.busy}
                  onPress={() => void openCloud(item.conversation)}
                  style={({ pressed }) => ({
                    paddingHorizontal: space.x5,
                    paddingVertical: space.x3,
                    minHeight: theme.touch,
                    gap: space.x1,
                    backgroundColor: pressed ? theme.layer.canvas.pressed : theme.layer.canvas.fill,
                  })}
                >
                  <SourceName name={item.conversation.channel.name} source="cloud" />
                  <Text variant="meta" tone="muted">
                    {t.recentNotLoaded}
                  </Text>
                </Pressable>
              )
            }
          />
        </HomeHeader>
      </HostDrawerEdge>
    </>
  );
}

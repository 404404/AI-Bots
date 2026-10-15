import { Redirect, Stack, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, View } from 'react-native';

import { useHostSession, useHostSnapshot, useInbox } from '../../../src/host/host-session';
import { ConversationRow } from '../../../src/ui/chat/conversation-row';
import {
  conversations,
  searchConversations,
  shortcutCounts,
  type ConversationFilter,
} from '../../../src/ui/chat/conversations';
import { ConnectionBanner } from '../../../src/ui/connection-banner';
import { space } from '../../../src/ui/design/tokens';
import { SearchField } from '../../../src/ui/primitives/search-field';
import { Text } from '../../../src/ui/primitives/text';
import { HomeHeader } from '../../../src/ui/shell/home-header';
import { openConversation } from '../../../src/ui/shell/open-conversation';
import { ShortcutCards } from '../../../src/ui/shell/shortcut-cards';
import { t } from '../../../src/ui/strings';
import type { HumanAttentionItem } from '../../../src/host/wire';

const NONE: HumanAttentionItem[] = [];

export default function HomeScreen() {
  const router = useRouter();
  const { saved, client, inbox } = useHostSession();
  const snapshot = useHostSnapshot(client);
  const list = useInbox(inbox);
  const [filter, setFilter] = useState<ConversationFilter>('all');
  const [query, setQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const action = list.status === 'ready' ? list.sections.action : NONE;
  const searching = query.trim() !== '';
  const rows = useMemo(
    () =>
      searching
        ? searchConversations(snapshot.roster, action, query)
        : conversations(snapshot.roster, action, filter),
    [snapshot.roster, action, filter, query, searching],
  );
  const counts = useMemo(() => shortcutCounts(snapshot.roster, action), [snapshot.roster, action]);
  const now = new Date();

  if (saved === undefined)
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  if (saved === null) return <Redirect href="/pair" />;

  const refresh = async () => {
    setRefreshing(true);
    await Promise.all([client?.refresh(), inbox?.refresh()]).catch(() => undefined);
    setRefreshing(false);
  };

  return (
    <>
      <Stack.Screen options={{ title: saved.hostName, headerShown: false }} />
      <HomeHeader hostName={saved.hostName}>
        <FlatList
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          data={rows}
          contentInsetAdjustmentBehavior="automatic"
          keyExtractor={(row) => row.key}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
          ListHeaderComponent={
            <>
              <ConnectionBanner
                connection={snapshot.connection}
                onRetry={() => client?.retryNow()}
                onPairAgain={() => router.push('/pair')}
              />
              <SearchField
                value={query}
                placeholder={t.searchPlaceholder}
                onChangeText={setQuery}
              />
              {searching ? null : (
                <ShortcutCards counts={counts} filter={filter} onFilter={setFilter} />
              )}
            </>
          }
          ListEmptyComponent={
            snapshot.roster === undefined ? null : searching ? (
              <View style={{ padding: space.x6, alignItems: 'center' }}>
                <Text tone="muted" style={{ textAlign: 'center' }}>
                  {t.searchNoMatch(query.trim())}
                </Text>
              </View>
            ) : (
              <View style={{ padding: space.x6, alignItems: 'center', gap: space.x3 }}>
                <Text tone="muted">{filter === 'all' ? t.noBots : t.noConversations}</Text>
                {filter === 'all' ? null : (
                  <Text tone="accent" accessibilityRole="button" onPress={() => setFilter('all')}>
                    {t.showAll}
                  </Text>
                )}
              </View>
            )
          }
          renderItem={({ item }) => (
            <ConversationRow row={item} now={now} onPress={() => openConversation(router, item)} />
          )}
        />
      </HomeHeader>
    </>
  );
}

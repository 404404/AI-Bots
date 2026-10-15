import { useMemo, type ReactElement } from 'react';
import { FlatList, View } from 'react-native';

import type { RosterView } from '../../host/client';
import type { HumanAttentionItem } from '../../host/wire';
import { ConversationRow } from '../chat/conversation-row';
import { searchConversations, type Conversation } from '../chat/conversations';
import { space } from '../design/tokens';
import { Text } from '../primitives/text';
import { t } from '../strings';

export function SearchResults({
  roster,
  action,
  query,
  onOpen,
  header,
}: {
  roster: RosterView | undefined;
  action: HumanAttentionItem[];
  query: string;
  onOpen(row: Conversation): void;
  header?: ReactElement;
}) {
  const rows = useMemo(() => searchConversations(roster, action, query), [roster, action, query]);
  const now = new Date();
  const typed = query.trim() !== '';
  return (
    <FlatList
      data={rows}
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      keyExtractor={(row) => row.key}
      {...(header === undefined ? {} : { ListHeaderComponent: header })}
      ListEmptyComponent={
        roster === undefined ? null : (
          <View style={{ padding: space.x6, alignItems: 'center' }}>
            <Text tone="muted" style={{ textAlign: 'center' }}>
              {typed ? t.searchNoMatch(query.trim()) : t.searchHint}
            </Text>
          </View>
        )
      }
      renderItem={({ item }) => (
        <ConversationRow row={item} now={now} onPress={() => onOpen(item)} />
      )}
    />
  );
}

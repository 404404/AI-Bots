import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';

import { useHostSession, useHostSnapshot, useInbox } from '../../../src/host/host-session';
import type { HumanAttentionItem } from '../../../src/host/wire';
import { useDesignTheme } from '../../../src/ui/design/theme';
import { openConversation } from '../../../src/ui/shell/open-conversation';
import { SearchResults } from '../../../src/ui/shell/search-results';
import { t } from '../../../src/ui/strings';

const NONE: HumanAttentionItem[] = [];

export default function SearchScreen() {
  const router = useRouter();
  const theme = useDesignTheme();
  const { client, inbox } = useHostSession();
  const snapshot = useHostSnapshot(client);
  const list = useInbox(inbox);
  const [query, setQuery] = useState('');
  return (
    <>
      <Stack.Screen options={{ title: t.search }} />
      <Stack.SearchBar
        placeholder={t.searchPlaceholder}
        autoCapitalize="none"
        hideWhenScrolling={false}
        tintColor={theme.color.fg}
        textColor={theme.color.fg}
        onChangeText={(event) => setQuery(event.nativeEvent.text)}
        onCancelButtonPress={() => setQuery('')}
      />
      <SearchResults
        roster={snapshot.roster}
        action={list.status === 'ready' ? list.sections.action : NONE}
        query={query}
        onOpen={(row) => openConversation(router, row)}
      />
    </>
  );
}

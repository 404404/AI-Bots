import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';

import { useHostSession, useHostSnapshot, useInbox } from '../../../src/host/host-session';
import type { HumanAttentionItem } from '../../../src/host/wire';
import { SearchField } from '../../../src/ui/primitives/search-field';
import { openConversation } from '../../../src/ui/shell/open-conversation';
import { SearchResults } from '../../../src/ui/shell/search-results';
import { t } from '../../../src/ui/strings';

const NONE: HumanAttentionItem[] = [];

export default function SearchScreen() {
  const router = useRouter();
  const { client, inbox } = useHostSession();
  const snapshot = useHostSnapshot(client);
  const list = useInbox(inbox);
  const [query, setQuery] = useState('');
  return (
    <>
      <Stack.Screen options={{ title: t.search }} />
      <SearchResults
        roster={snapshot.roster}
        action={list.status === 'ready' ? list.sections.action : NONE}
        query={query}
        onOpen={(row) => openConversation(router, row)}
        header={
          <SearchField value={query} placeholder={t.searchPlaceholder} onChangeText={setQuery} />
        }
      />
    </>
  );
}

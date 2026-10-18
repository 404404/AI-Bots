import { File, Paths } from 'expo-file-system';
import { useMemo, useSyncExternalStore } from 'react';

import { createActivityCountPreferences, observeActivityCount } from './activity-count';
import { useConversationFilter } from './native-conversation-filter';
import { includesComputerActivity } from './conversation-environments';
import { useHostSession } from './host-session';

const file = () => new File(Paths.document, 'deepseekbot-activity-count.json');

export const activityCountPreferences = createActivityCountPreferences({
  async read() {
    const stored = file();
    return stored.exists ? (JSON.parse(await stored.text()) as unknown) : undefined;
  },
  write(kinds) {
    const stored = file();
    if (!stored.exists) stored.create();
    stored.writeSync(JSON.stringify(kinds));
  },
});

export function useActivityCountPreferences() {
  return useSyncExternalStore(
    activityCountPreferences.subscribe,
    activityCountPreferences.getSnapshot,
  );
}

const empty = { count: undefined, stale: false };

export function useActivityCount() {
  const { saved, client, inbox } = useHostSession();
  const [scope] = useConversationFilter();
  const available = includesComputerActivity(scope, saved?.hostId);
  const observer = useMemo(
    () =>
      available && client && inbox
        ? observeActivityCount(client, inbox, activityCountPreferences)
        : undefined,
    [available, client, inbox],
  );
  return useSyncExternalStore(
    observer?.subscribe ?? (() => () => {}),
    observer?.getSnapshot ?? (() => empty),
  );
}

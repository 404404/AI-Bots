import { useCallback, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

import { createHostClient, type HostClient, type HostSnapshot } from './client';
import { createInbox, type Inbox, type InboxSnapshot } from './inbox';
import { nativeCarrier } from './native-carrier';
import { forgetHost, loadSavedHost, saveHost, type SavedHost } from './saved-host';

export interface HostSessionState {
  saved: SavedHost | null | undefined;
  client: HostClient | undefined;
  inbox: Inbox | undefined;
}

const listeners = new Set<() => void>();
let state: HostSessionState = { saved: undefined, client: undefined, inbox: undefined };

function adopt(saved: SavedHost | null): void {
  state.inbox?.stop();
  state.client?.stop();
  const client =
    saved === null
      ? undefined
      : createHostClient({
          routes: saved.routes,
          credential: saved.credential,
          carrier: nativeCarrier(),
        });
  state = { saved, client, inbox: client === undefined ? undefined : createInbox(client) };
  client?.start();
  for (const listener of listeners) listener();
}

void loadSavedHost().then(
  (saved) => adopt(saved ?? null),
  () => adopt(null),
);

AppState.addEventListener('change', (next) => {
  if (next !== 'active') return;
  state.client?.retryNow();
  if (state.client?.getSnapshot().connection.status === 'connected') void state.inbox?.refresh();
});

export const hostSession = {
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  getState: (): HostSessionState => state,
  async pair(host: SavedHost): Promise<void> {
    await saveHost(host);
    adopt(host);
  },
  async unpair(): Promise<void> {
    await forgetHost();
    adopt(null);
  },
};

export function useHostSession(): HostSessionState {
  return useSyncExternalStore(hostSession.subscribe, hostSession.getState);
}

const detached: HostSnapshot = { connection: { status: 'stopped', route: '' } };

export function useHostSnapshot(client: HostClient | undefined): HostSnapshot {
  return useSyncExternalStore(
    useCallback((listener: () => void) => client?.subscribe(listener) ?? (() => {}), [client]),
    () => client?.getSnapshot() ?? detached,
  );
}

const idle: InboxSnapshot = { status: 'idle' };

export function useInbox(inbox: Inbox | undefined): InboxSnapshot {
  return useSyncExternalStore(
    useCallback((listener: () => void) => inbox?.subscribe(listener) ?? (() => {}), [inbox]),
    () => inbox?.getSnapshot() ?? idle,
  );
}

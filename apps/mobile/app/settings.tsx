import { useRouter } from 'expo-router';
import { useMemo } from 'react';

import { buildLabel, readBuildStamp } from '../src/host/build-id';
import { fullClientParams } from '../src/host/full-client';
import { hostSession, useHostSession, useHostSnapshot } from '../src/host/host-session';
import { loadUsage } from '../src/host/usage';
import { SettingsView } from '../src/ui/settings-view';
import { openHostDrawer } from '../src/ui/shell/host-drawer';

export default function SettingsScreen() {
  const router = useRouter();
  const { saved, client } = useHostSession();
  const { connection } = useHostSnapshot(client);
  const usage = useMemo(
    () => (client === undefined ? undefined : () => loadUsage(client, 'week')),
    [client],
  );
  return (
    <SettingsView
      key={saved?.hostId}
      hostName={saved?.hostName}
      build={buildLabel(readBuildStamp())}
      connection={connection}
      loadUsage={usage}
      actions={{
        onClose: () => router.back(),
        onUsage: () => router.push('/usage'),
        onOpenFullClient: () =>
          router.push({ pathname: '/full-client', params: fullClientParams({ kind: 'home' }) }),
        onComputers: () => {
          router.back();
          openHostDrawer();
        },
        onAppIcon: () => router.push('/app-icon'),
        onNotifications: () => router.push('/notifications'),
        onUnpair: () => hostSession.unpair().then(() => router.dismissTo('/')),
      }}
    />
  );
}

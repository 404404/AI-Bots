import { useLocalSearchParams, useRouter } from 'expo-router';

import { useHostSession } from '../src/host/host-session';
import { forgetImage, hostLooks, pickLookImage, useHostLook } from '../src/host/native-host-look';
import { HostLookEditor } from '../src/ui/shell/host-look-editor';

export default function HostLookScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ hostId?: string }>();
  const { saved, hosts } = useHostSession();
  const host = hosts.find((entry) => entry.hostId === params.hostId) ?? saved;
  const hostId = host?.hostId ?? '';
  const look = useHostLook(hostId);
  return (
    <HostLookEditor
      hostName={host?.hostName ?? '—'}
      look={look}
      actions={{
        onChange(next) {
          const before = hostLooks.look(hostId);
          hostLooks.set(hostId, next);
          if (before.avatar.kind === 'image' && before.avatar !== next.avatar)
            forgetImage(before.avatar.uri);
          if (before.banner.kind === 'image' && before.banner !== next.banner)
            forgetImage(before.banner.uri);
        },
        onPickImage: (slot) => pickLookImage(hostId, slot),
        onClose: () => router.back(),
      }}
    />
  );
}

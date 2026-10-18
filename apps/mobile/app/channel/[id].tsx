import { useLocalSearchParams } from 'expo-router';

import { ConversationScreen } from '../../src/ui/chat/conversation-screen';

export default function ChannelScreen() {
  const { id, focus, focusWindow, hostId } = useLocalSearchParams<{
    id: string;
    hostId?: string;
    focus?: string;
    focusWindow?: string;
  }>();
  return (
    <ConversationScreen
      expectedHostId={hostId}
      place={{ kind: 'channel', channelId: id }}
      focus={focus}
      latestWindowOnly={focusWindow === 'latest'}
    />
  );
}

import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, View, type ViewInstance } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  chatBackgrounds,
  useChatBackgrounds,
  backgroundImageUri,
  pickBackgroundImage,
} from '../src/host/native-chat-background';
import { useHostSession } from '../src/host/host-session';
import type { BackgroundScope, BackgroundEdit } from '../src/host/chat-background';
import { ChatBackgroundEditor } from '../src/ui/chat/chat-background-editor';
import { SheetScreen } from '../src/ui/primitives/sheet-screen';
import { Text } from '../src/ui/primitives/text';
import { t } from '../src/ui/strings';

function Editor({ scope }: { scope: BackgroundScope | undefined }) {
  const router = useRouter();
  const [edit, setEdit] = useState<BackgroundEdit>();
  const [target] = useState(scope);
  const mount = useCallback(
    (node: ViewInstance | null) => {
      if (node === null) return;
      const draft = chatBackgrounds.edit(target);
      setEdit(draft);
      return () => {
        void draft.cancel();
      };
    },
    [target],
  );
  return (
    <View ref={mount} style={{ flex: 1 }}>
      {edit === undefined ? (
        <ActivityIndicator />
      ) : (
        <ChatBackgroundEditor
          scoped={scope !== undefined}
          edit={edit}
          inherited={chatBackgrounds.resolve()}
          imageUri={backgroundImageUri}
          onPickImage={pickBackgroundImage}
          onDone={() => router.back()}
          onCancel={() => {
            void edit.cancel();
            router.back();
          }}
        />
      )}
    </View>
  );
}

export default function ChatBackgroundScreen() {
  const params = useLocalSearchParams<{ hostId?: string; channelId?: string }>();
  const { hosts } = useHostSession();
  const state = useChatBackgrounds();
  const valid =
    (params.hostId === undefined && params.channelId === undefined) ||
    (params.hostId !== undefined &&
      !!params.channelId &&
      hosts.some((host) => host.hostId === params.hostId));
  const scope =
    params.hostId && params.channelId
      ? { hostId: params.hostId, channelId: params.channelId }
      : undefined;
  return (
    <SheetScreen>
      <SafeAreaView edges={['bottom']} style={{ flex: 1 }}>
        {!valid ? (
          <Text accessibilityRole="alert">{t.chatBackground.failed}</Text>
        ) : !state.loaded ? (
          <ActivityIndicator />
        ) : (
          <Editor key={JSON.stringify(scope)} scope={scope} />
        )}
      </SafeAreaView>
    </SheetScreen>
  );
}

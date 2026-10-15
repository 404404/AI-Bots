import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { ActivityIndicator, Pressable, TextInput, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { createComputerViewer, type ComputerViewerState } from '../../src/host/computer-viewer';
import { useHostSession, useHostSnapshot } from '../../src/host/host-session';
import { BrowserStage, type BrowserTouchMode } from '../../src/ui/chat/browser-stage';
import { buttonColors } from '../../src/ui/design/controls';
import { radius, space } from '../../src/ui/design/tokens';
import { useDesignTheme } from '../../src/ui/design/theme';
import { Button } from '../../src/ui/primitives/button';
import { Text } from '../../src/ui/primitives/text';
import { CloseIcon, KeyboardIcon, LockIcon } from '../../src/ui/shell/icons';
import { useMounted } from '../../src/ui/mounted';
import { t } from '../../src/ui/strings';

const idle: ComputerViewerState = { status: 'loading', control: false };

export default function ComputerScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const router = useRouter();
  const theme = useDesignTheme();
  const insets = useSafeAreaInsets();
  const { client } = useHostSession();
  const snapshot = useHostSnapshot(client);
  const bot = snapshot.roster?.bots.find((entry) => entry.slug === slug);
  const viewer = useMemo(
    () => (client === undefined ? undefined : createComputerViewer({ client })),
    [client],
  );
  const state = useSyncExternalStore(
    (listener) => viewer?.subscribe(listener) ?? (() => {}),
    () => viewer?.getState() ?? idle,
  );
  const [mode, setMode] = useState<BrowserTouchMode>('direct');
  const keyboard = useRef<TextInput>(null);
  const [secret, setSecret] = useState(false);
  const openKeyboard = (password: boolean) => {
    setSecret(password);
    keyboard.current?.blur();
    setTimeout(() => keyboard.current?.focus(), 50);
  };

  const mount = useMounted<View>(() => {
    viewer?.start();
    return () => viewer?.stop();
  }, [viewer]);

  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const revoked = state.status === 'refused' || snapshot.connection.status === 'refused';
  const message = revoked
    ? t.browserRevoked
    : state.status === 'not-running'
      ? t.computerNotRunning
      : state.status === 'unreachable' && state.frame === undefined
        ? t.computerUnreachable
        : undefined;
  const live = !revoked && state.frame !== undefined && message === undefined;
  const driving = live && state.control;
  const control = buttonColors(theme, 'secondary', 'canvas');

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: theme.layer.canvas.fill }}>
      <View
        style={{
          paddingTop: insets.top + space.x3,
          paddingHorizontal: space.x5,
          paddingBottom: space.x3,
          flexDirection: 'row',
          alignItems: 'center',
          gap: space.x4,
        }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t.computerClose}
          onPress={close}
          hitSlop={space.x3}
          style={({ pressed }) => ({
            width: theme.touch,
            height: theme.touch,
            borderRadius: radius.round,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: pressed ? control.pressed : control.fill,
          })}
        >
          <CloseIcon color={control.label} size={theme.touch / 2} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text variant="title" numberOfLines={1}>
            {t.computerTitle(bot?.displayName ?? slug ?? '')}
          </Text>
          <Text variant="meta" tone={driving ? 'accent' : 'muted'} numberOfLines={2}>
            {live ? (driving ? t.computerYouDriving : t.computerWatching) : ' '}
          </Text>
        </View>
      </View>

      <View ref={mount} style={{ flex: 1 }}>
        {live ? (
          <BrowserStage
            frame={state.frame!}
            interactive={driving}
            mode={mode}
            onInput={(input) => void viewer?.send(input)}
          />
        ) : (
          <View
            style={{
              flex: 1,
              alignItems: 'center',
              justifyContent: 'center',
              padding: space.x6,
            }}
          >
            {message === undefined ? (
              <>
                <ActivityIndicator color={theme.color.muted} />
                <Text tone="muted" style={{ marginTop: space.x4 }}>
                  {t.computerLoading}
                </Text>
              </>
            ) : (
              <Text accessibilityRole="alert" tone="muted" style={{ textAlign: 'center' }}>
                {message}
              </Text>
            )}
          </View>
        )}
      </View>

      {state.notice === undefined || !live ? null : (
        <Text
          accessibilityLiveRegion="polite"
          variant="meta"
          tone="warning"
          numberOfLines={2}
          style={{
            backgroundColor: theme.color.warningSoft,
            paddingHorizontal: space.x5,
            paddingVertical: space.x3,
          }}
        >
          {state.notice}
        </Text>
      )}

      {!live ? null : (
        <View
          style={{
            paddingHorizontal: space.x5,
            paddingTop: space.x4,
            paddingBottom: insets.bottom + space.x4,
            gap: space.x4,
          }}
        >
          {!driving ? null : (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: space.x3,
              }}
            >
              <View
                accessibilityRole="radiogroup"
                style={{
                  flex: 1,
                  flexDirection: 'row',
                  padding: space.x2,
                  borderRadius: radius.round,
                  backgroundColor: theme.layer.raised.fill,
                }}
              >
                {(['direct', 'trackpad'] as const).map((option) => (
                  <Pressable
                    key={option}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: mode === option }}
                    accessibilityLabel={option === 'direct' ? t.browserDirect : t.browserTrackpad}
                    onPress={() => setMode(option)}
                    style={{
                      flex: 1,
                      minHeight: theme.touch - space.x3,
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderRadius: radius.round,
                      backgroundColor: mode === option ? theme.layer.raised.selected : undefined,
                    }}
                  >
                    <Text variant="meta" strong={mode === option}>
                      {option === 'direct' ? t.browserDirect : t.browserTrackpad}
                    </Text>
                  </Pressable>
                ))}
              </View>
              {(
                [
                  [false, t.browserKeyboard, KeyboardIcon],
                  [true, t.computerPasswordKeyboard, LockIcon],
                ] as const
              ).map(([password, label, Icon]) => (
                <Pressable
                  key={label}
                  accessibilityRole="button"
                  accessibilityLabel={label}
                  onPress={() => openKeyboard(password)}
                  style={({ pressed }) => ({
                    width: theme.touch,
                    height: theme.touch,
                    borderRadius: radius.round,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: pressed ? control.pressed : control.fill,
                  })}
                >
                  <Icon color={control.label} size={theme.touch / 2} />
                </Pressable>
              ))}
            </View>
          )}
          <Button
            label={driving ? t.computerHandBack : t.computerTakeControl}
            tone={driving ? 'secondary' : 'primary'}
            on="canvas"
            onPress={() => void viewer?.setControl(!driving)}
          />
          <TextInput
            ref={keyboard}
            accessibilityLabel={t.browserTypeHere}
            value=""
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry={secret}
            textContentType={secret ? 'password' : 'none'}
            autoComplete={secret ? 'current-password' : 'off'}
            submitBehavior="submit"
            onChangeText={(text) => {
              if (text !== '') void viewer?.send({ kind: 'type', text });
            }}
            onKeyPress={(event) => {
              if (event.nativeEvent.key === 'Backspace')
                void viewer?.send({ kind: 'key', key: 'Backspace' });
            }}
            onSubmitEditing={() => void viewer?.send({ kind: 'key', key: 'Enter' })}
            style={{ position: 'absolute', width: 1, height: 1, opacity: 0 }}
          />
        </View>
      )}
    </GestureHandlerRootView>
  );
}

import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  TextInput,
  View,
} from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { BrowserInput } from '../../src/host/browser-viewer';
import {
  COMPUTER_KEYS,
  createComputerViewer,
  typedInputs,
  wheelInput,
  type ComputerModifier,
  type ComputerViewerState,
} from '../../src/host/computer-viewer';
import { useHostSession, useHostSnapshot } from '../../src/host/host-session';
import { BrowserStage, type BrowserTouchMode } from '../../src/ui/chat/browser-stage';
import {
  ComputerDock,
  ComputerKeyBar,
  ComputerMousePad,
  type ComputerTool,
} from '../../src/ui/chat/computer-controls';
import { buttonColors } from '../../src/ui/design/controls';
import { radius, space } from '../../src/ui/design/tokens';
import { useDesignTheme } from '../../src/ui/design/theme';
import { Button } from '../../src/ui/primitives/button';
import { Text } from '../../src/ui/primitives/text';
import { CloseIcon } from '../../src/ui/shell/icons';
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
  const [mode, setMode] = useState<BrowserTouchMode>('trackpad');
  const [tool, setTool] = useState<ComputerTool>('mouse');
  const keyboard = useRef<TextInput>(null);
  const [secret, setSecret] = useState(false);
  const [modifiers, setModifiers] = useState<readonly ComputerModifier[]>([]);
  const cursor = useSharedValue({ x: 0, y: 0 });
  const openKeyboard = (password: boolean) => {
    setSecret(password);
    keyboard.current?.blur();
    setTimeout(() => keyboard.current?.focus(), 50);
  };
  const send = (input: BrowserInput | undefined) => {
    if (input !== undefined) void viewer?.send(input);
  };
  // A latched modifier applies to the next key only, like a sticky key.
  const chord = (key: string) => {
    send({ kind: 'key', key, modifiers: [...modifiers] });
    setModifiers([]);
  };
  const choose = (next: ComputerTool) => {
    if (next === 'keyboard') openKeyboard(secret);
    else keyboard.current?.blur();
    if (next === 'mouse') setMode('trackpad');
    setTool(next);
  };

  useEffect(() => {
    const hidden = Keyboard.addListener('keyboardDidHide', () =>
      setTool((current) => (current === 'keyboard' ? 'mouse' : current)),
    );
    return () => hidden.remove();
  }, []);

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
  const frameWidth = state.frame?.width ?? 0;
  const frameHeight = state.frame?.height ?? 0;

  // The pointer starts in the middle of the screen once its size is known.
  useEffect(() => {
    if (frameWidth > 0 && cursor.value.x === 0 && cursor.value.y === 0)
      cursor.value = { x: Math.round(frameWidth / 2), y: Math.round(frameHeight / 2) };
  }, [cursor, frameWidth, frameHeight]);

  const onAccent = buttonColors(theme, 'primary', 'canvas');

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
        {!driving ? null : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t.computerHandBack}
            onPress={() => void viewer?.setControl(false)}
            style={({ pressed }) => ({
              minHeight: theme.touch,
              paddingHorizontal: space.x4,
              borderRadius: radius.round,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: pressed ? onAccent.pressed : onAccent.fill,
            })}
          >
            <Text variant="meta" strong style={{ color: onAccent.label }}>
              {t.computerHandBack}
            </Text>
          </Pressable>
        )}
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View ref={mount} style={{ flex: 1 }}>
          {live ? (
            <BrowserStage
              frame={state.frame!}
              interactive={driving}
              mode={mode}
              cursor={cursor}
              pointerShape="arrow"
              onInput={send}
              onWheel={(dragY, at) => send(wheelInput(dragY, at))}
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
              paddingBottom: tool === 'keyboard' ? space.x3 : insets.bottom + space.x3,
              gap: space.x4,
            }}
          >
            {!driving ? (
              <Button
                label={t.computerTakeControl}
                tone="primary"
                on="canvas"
                onPress={() => void viewer?.setControl(true)}
              />
            ) : tool === 'keyboard' ? (
              <ComputerKeyBar
                modifiers={modifiers}
                secret={secret}
                onModifier={(modifier) =>
                  setModifiers((current) =>
                    current.includes(modifier)
                      ? current.filter((entry) => entry !== modifier)
                      : [...current, modifier],
                  )
                }
                onKey={chord}
                onSecret={() => openKeyboard(!secret)}
                onHide={() => Keyboard.dismiss()}
              />
            ) : (
              <>
                {tool === 'mouse' && mode === 'trackpad' ? (
                  <ComputerMousePad
                    onClick={(button) =>
                      send({ kind: 'click', x: cursor.value.x, y: cursor.value.y, button })
                    }
                    onWheel={(dragY) => send(wheelInput(dragY, cursor.value))}
                  />
                ) : null}
                {tool === 'control' ? (
                  <View
                    accessibilityRole="radiogroup"
                    accessibilityLabel={t.computerTouchMode}
                    style={{
                      flexDirection: 'row',
                      padding: space.x2,
                      borderRadius: radius.round,
                      backgroundColor: theme.layer.raised.fill,
                    }}
                  >
                    {(['trackpad', 'direct'] as const).map((option) => (
                      <Pressable
                        key={option}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: mode === option }}
                        accessibilityLabel={
                          option === 'direct' ? t.browserDirect : t.browserTrackpad
                        }
                        onPress={() => setMode(option)}
                        style={{
                          flex: 1,
                          minHeight: theme.touch - space.x3,
                          alignItems: 'center',
                          justifyContent: 'center',
                          borderRadius: radius.round,
                          backgroundColor:
                            mode === option ? theme.layer.raised.selected : undefined,
                        }}
                      >
                        <Text variant="meta" strong={mode === option}>
                          {option === 'direct' ? t.browserDirect : t.browserTrackpad}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                ) : null}
                <ComputerDock tool={tool} onTool={choose} />
              </>
            )}
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
                for (const input of typedInputs(text, modifiers)) send(input);
                if (modifiers.length > 0) setModifiers([]);
              }}
              onKeyPress={(event) => {
                if (event.nativeEvent.key === 'Backspace') chord(COMPUTER_KEYS.backspace);
              }}
              onSubmitEditing={() => chord(COMPUTER_KEYS.enter)}
              style={{ position: 'absolute', width: 1, height: 1, opacity: 0 }}
            />
          </View>
        )}
      </KeyboardAvoidingView>
    </GestureHandlerRootView>
  );
}

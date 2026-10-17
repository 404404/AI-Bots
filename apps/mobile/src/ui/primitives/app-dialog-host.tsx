import { useRef, useSyncExternalStore } from 'react';
import {
  AccessibilityInfo,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  View,
  type ViewInstance,
} from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useDesignTheme } from '../design/theme';
import { androidSettings, modalRail, space } from '../design/tokens';
import { t } from '../strings';
import { Button } from './button';
import { appDialogs } from './dialog-state';
import { SettingsRow } from './settings-row';
import { Text } from './text';

export function AppDialogHost() {
  const shown = useSyncExternalStore(
    appDialogs.subscribe,
    appDialogs.getSnapshot,
    appDialogs.getSnapshot,
  );
  const theme = useDesignTheme();
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const heading = useRef<ViewInstance>(null);
  if (Platform.OS !== 'android' || shown === undefined) return null;
  const choices = shown.actions.flatMap((action, index) =>
    action.style === 'cancel' ? [] : [{ action, index }],
  );
  const cancel = shown.actions.find((action) => action.style === 'cancel');
  const menu = choices.length > 1;
  const stacked = theme.largeText || menu;
  const actionStyle = stacked
    ? undefined
    : { flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 0 };
  const dismiss = () => appDialogs.dismiss();
  return (
    <Modal
      transparent
      visible
      animationType={reducedMotion ? 'none' : 'fade'}
      onRequestClose={dismiss}
      onShow={() => {
        if (heading.current) AccessibilityInfo.sendAccessibilityEvent?.(heading.current, 'focus');
      }}
    >
      <View
        style={{
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          paddingHorizontal: space.x6,
          paddingTop: insets.top + space.x6,
          paddingBottom: insets.bottom + space.x6,
          backgroundColor: theme.scrim,
        }}
      >
        <Pressable
          accessible={false}
          importantForAccessibility="no"
          onPress={dismiss}
          style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }}
        />
        <View
          testID="app-dialog"
          accessibilityViewIsModal
          onAccessibilityEscape={dismiss}
          style={{
            width: '100%',
            maxWidth: modalRail.maxWidth,
            maxHeight: '100%',
            borderRadius: androidSettings.radius,
            backgroundColor: theme.overlay.fill,
            overflow: 'hidden',
          }}
        >
          <ScrollView
            contentContainerStyle={{ padding: space.x6, gap: space.x5 }}
            keyboardShouldPersistTaps="handled"
            style={{ flexGrow: 0, flexShrink: 1 }}
          >
            <View
              ref={heading}
              accessible
              accessibilityRole="header"
              accessibilityLabel={shown.title}
            >
              <Text variant="title" strong accessible={false}>
                {shown.title}
              </Text>
            </View>
            {shown.message === undefined ? null : <Text tone="muted">{shown.message}</Text>}
            {shown.error === undefined ? null : (
              <Text accessibilityRole="alert" accessibilityLiveRegion="polite" tone="danger">
                {t.dialogFailed} {shown.error}
              </Text>
            )}
            {menu ? (
              <View>
                {choices.map(({ action, index }) => (
                  <SettingsRow
                    key={index}
                    title={action.text}
                    tone={action.style === 'destructive' ? 'danger' : 'fg'}
                    on="sheet"
                    onPress={
                      shown.busy === undefined
                        ? () => {
                            void appDialogs.choose(index);
                          }
                        : undefined
                    }
                  />
                ))}
              </View>
            ) : null}
            <View
              testID="app-dialog-actions"
              style={{ flexDirection: stacked ? 'column' : 'row', gap: space.x3 }}
            >
              {cancel === undefined ? null : (
                <View testID="app-dialog-cancel-cell" style={actionStyle}>
                  <Button
                    label={cancel.text}
                    onPress={dismiss}
                    on="sheet"
                    disabled={shown.busy !== undefined}
                  />
                </View>
              )}
              {menu
                ? null
                : choices.map(({ action, index }) => (
                    <View
                      key={index}
                      testID={`app-dialog-action-cell-${index}`}
                      style={actionStyle}
                    >
                      <Button
                        label={action.text}
                        tone={action.style === 'destructive' ? 'danger' : 'primary'}
                        on="sheet"
                        disabled={shown.busy !== undefined}
                        busy={shown.busy === index}
                        onPress={() => {
                          void appDialogs.choose(index);
                        }}
                      />
                    </View>
                  ))}
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

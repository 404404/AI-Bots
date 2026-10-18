import {
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useState } from 'react';
import {
  creationActions,
  targetsFor,
  type CreationAction,
  type CreationTarget,
} from '../../host/creation-targets';
import { useDesignTheme } from '../design/theme';
import { radius, space } from '../design/tokens';
import { NavigationMaterial } from './navigation-material';
import { Button } from '../primitives/button';
import { Text } from '../primitives/text';
import { CloseIcon, ComputerIcon, CloudIcon, PersonIcon, ChatsIcon, ShareIcon } from './icons';
import { t } from '../strings';

export const creationLabel = (action: CreationAction) =>
  ({
    channel: t.newChannel,
    bot: t.newPersonaBot,
    invite: t.invitePeople,
    join: t.cloudJoin.title,
  })[action];

export function CreationPanel({
  scope,
  targets,
  bottom,
  size,
  onClose,
  onPick,
  busy,
  error,
}: {
  scope: string;
  targets: CreationTarget[];
  bottom: number;
  size: number;
  onClose(): void;
  onPick(action: CreationAction, target?: CreationTarget): void;
  busy: boolean;
  error?: string | undefined;
}) {
  const theme = useDesignTheme();
  const insets = useSafeAreaInsets();
  const { width, height, fontScale } = useWindowDimensions();
  const [choosing, setChoosing] = useState<CreationAction>();
  const singleColumn = fontScale > 1.3 || width < 360 || !!choosing;
  const actions = creationActions(scope, targets);
  const choices = choosing ? targetsFor(choosing, scope, targets) : [];
  const pick = (action: CreationAction) => {
    if (action === 'join') return onPick(action);
    if (scope === 'all') return setChoosing(action);
    const target = targetsFor(action, scope, targets)[0];
    if (target) onPick(action, target);
  };
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1 }} accessibilityViewIsModal onAccessibilityEscape={onClose}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t.close}
          onPress={onClose}
          style={[StyleSheet.absoluteFill, { backgroundColor: theme.scrim }]}
        />
        <View
          pointerEvents="box-none"
          style={{
            position: 'absolute',
            bottom,
            left: insets.left + space.x5,
            right: insets.right + space.x5,
            flexDirection: 'row',
            alignItems: 'flex-end',
            gap: space.x3,
          }}
        >
          <View
            style={{
              flex: 1,
              maxHeight: height - bottom - insets.top - space.x5,
              borderRadius: radius.xl,
              overflow: 'hidden',
            }}
          >
            <NavigationMaterial rounded />
            {choosing ? (
              <FlatList
                data={choices}
                keyExtractor={(target) => target.key}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={{ padding: space.x4, gap: space.x4 }}
                ListHeaderComponent={
                  <>
                    <Text variant="title" strong>
                      {t.chooseCreationTarget}
                    </Text>
                    {!!error && <Text accessibilityRole="alert">{error}</Text>}
                  </>
                }
                ListEmptyComponent={<Text>{t.noCreationTargets}</Text>}
                ListFooterComponent={
                  <Button label={t.back} disabled={busy} onPress={() => setChoosing(undefined)} />
                }
                renderItem={({ item: target }) => (
                  <Button
                    disabled={busy}
                    label={target.name}
                    icon={
                      target.kind === 'computer' ? (
                        <ComputerIcon color={theme.color.fg} size={theme.type.title.line} />
                      ) : (
                        <CloudIcon color={theme.color.fg} size={theme.type.title.line} />
                      )
                    }
                    onPress={() => onPick(choosing, target)}
                  />
                )}
              />
            ) : (
              <ScrollView
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={{ padding: space.x4, gap: space.x4 }}
              >
                <Text variant="title" strong>
                  {t.createHere}
                </Text>
                {!!error && <Text accessibilityRole="alert">{error}</Text>}
                <View
                  style={{
                    flexDirection: singleColumn ? 'column' : 'row',
                    flexWrap: 'wrap',
                    gap: space.x3,
                  }}
                >
                  {actions.map((action) => {
                    const Icon =
                      action === 'channel' ? ChatsIcon : action === 'bot' ? PersonIcon : ShareIcon;
                    return (
                      <Pressable
                        key={action}
                        accessibilityRole="button"
                        accessibilityLabel={creationLabel(action)}
                        disabled={busy}
                        onPress={() => pick(action)}
                        style={({ pressed }) => ({
                          width: singleColumn ? '100%' : '47%',
                          minHeight: theme.touch,
                          borderRadius: radius.lg,
                          padding: space.x4,
                          gap: space.x3,
                          alignItems: 'center',
                          backgroundColor: pressed
                            ? theme.layer.raised.chosen
                            : theme.layer.well.fill,
                          opacity: busy ? 0.5 : 1,
                        })}
                      >
                        <Icon color={theme.color.fg} size={theme.type.title.line} />
                        <Text strong style={{ textAlign: 'center' }}>
                          {creationLabel(action)}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                {actions.length === 0 && <Text>{t.noCreationTargets}</Text>}
              </ScrollView>
            )}
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t.close}
            onPress={onClose}
            style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}
          >
            <NavigationMaterial circle />
            <CloseIcon color={theme.color.fg} size={theme.type.title.line} />
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

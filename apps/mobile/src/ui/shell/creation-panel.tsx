import { NavigationAction } from './navigation-action';
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
import { useState, type ReactNode } from 'react';
import {
  creationActions,
  targetsFor,
  type CreationAction,
  type CreationTarget,
} from '../../host/creation-targets';
import { useDesignTheme } from '../design/theme';
import { radius, space } from '../design/tokens';
import { NavigationMaterial } from './navigation-material';
import { Text } from '../primitives/text';
import { ComputerIcon, CloudIcon, PersonIcon, ChatsIcon, ShareIcon } from './icons';
import { t } from '../strings';
import { cloudAvailable } from '../../cloud/available';

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
  const { height } = useWindowDimensions();
  const [choosing, setChoosing] = useState<CreationAction>();
  const actions = creationActions(scope, targets).filter((a) => cloudAvailable || a !== 'join');
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
                  <CreationMenuRow
                    label={t.back}
                    disabled={busy}
                    onPress={() => setChoosing(undefined)}
                  />
                }
                renderItem={({ item: target }) => (
                  <CreationMenuRow
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
                <View style={{ gap: space.x1 }}>
                  {actions.map((action) => {
                    const Icon =
                      action === 'channel' ? ChatsIcon : action === 'bot' ? PersonIcon : ShareIcon;
                    return (
                      <CreationMenuRow
                        key={action}
                        label={creationLabel(action)}
                        disabled={busy}
                        onPress={() => pick(action)}
                        icon={<Icon color={theme.color.fg} size={theme.type.title.line} />}
                      />
                    );
                  })}
                </View>

                {actions.length === 0 && <Text>{t.noCreationTargets}</Text>}
              </ScrollView>
            )}
          </View>
          <NavigationAction size={size} label={t.close} close onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}

function CreationMenuRow({
  label,
  icon,
  disabled,
  onPress,
}: {
  label: string;
  icon?: ReactNode;
  disabled: boolean;
  onPress(): void;
}) {
  const theme = useDesignTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        alignSelf: 'stretch',
        flexDirection: 'row',
        alignItems: 'center',
        minHeight: theme.touch,
        borderRadius: radius.lg,
        paddingHorizontal: space.x3,
        paddingVertical: space.x3,
        gap: space.x3,
        backgroundColor: pressed ? theme.layer.raised.chosen : undefined,
        opacity: disabled ? 0.5 : 1,
      })}
    >
      {icon && (
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={{ flexShrink: 0 }}
        >
          {icon}
        </View>
      )}
      <Text strong style={{ flex: 1, textAlign: 'left' }}>
        {label}
      </Text>
    </Pressable>
  );
}

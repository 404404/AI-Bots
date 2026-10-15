import { ActionSheetIOS, Alert, Platform, Pressable } from 'react-native';

import type { FullClientTarget } from '../../host/full-client';
import { useDesignTheme } from '../design/theme';
import { radius, space } from '../design/tokens';
import { t } from '../strings';
import { ComposeIcon, PlusIcon } from './icons';

export type CreateTarget = Extract<FullClientTarget, { kind: 'new-bot' | 'new-channel' }>;

export const CREATE_CHOICES: readonly { target: CreateTarget; label: string }[] = [
  { target: { kind: 'new-bot' }, label: t.newPersonaBot },
  { target: { kind: 'new-channel' }, label: t.newChannel },
];

export function openCreateMenu(onPick: (target: CreateTarget) => void): void {
  if (Platform.OS === 'ios') {
    ActionSheetIOS.showActionSheetWithOptions(
      {
        options: [...CREATE_CHOICES.map((choice) => choice.label), t.cancel],
        cancelButtonIndex: CREATE_CHOICES.length,
      },
      (index) => {
        const choice = CREATE_CHOICES[index];
        if (choice !== undefined) onPick(choice.target);
      },
    );
    return;
  }
  Alert.alert(t.create, undefined, [
    { text: t.cancel, style: 'cancel' },
    ...CREATE_CHOICES.map((choice) => ({
      text: choice.label,
      onPress: () => onPick(choice.target),
    })),
  ]);
}

export function ComposeButton({ onPick }: { onPick: (target: CreateTarget) => void }) {
  const theme = useDesignTheme();
  return (
    <Pressable
      onPress={() => openCreateMenu(onPick)}
      accessibilityRole="button"
      accessibilityLabel={t.create}
      style={({ pressed }) => ({
        minWidth: theme.touch,
        minHeight: theme.touch,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <ComposeIcon color={theme.color.fg} size={theme.type.title.line} />
    </Pressable>
  );
}

export function useFabClearance(): number {
  const theme = useDesignTheme();
  return theme.touch + space.x3 + space.x5 * 2;
}

export function CreateFab({ onPick }: { onPick: (target: CreateTarget) => void }) {
  const theme = useDesignTheme();
  const size = theme.touch + space.x3;
  return (
    <Pressable
      onPress={() => openCreateMenu(onPick)}
      accessibilityRole="button"
      accessibilityLabel={t.create}
      style={({ pressed }) => ({
        position: 'absolute',
        right: space.x5,
        bottom: space.x5,
        width: size,
        height: size,
        borderRadius: radius.lg,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.color.accent,
        opacity: pressed ? 0.85 : 1,
        shadowColor: theme.color.fg,
        shadowOpacity: 0.12,
        shadowRadius: radius.lg,
        shadowOffset: { width: 0, height: space.x2 },
        elevation: space.x3,
      })}
    >
      <PlusIcon color={theme.color.onAccent} size={theme.type.display.size} />
    </Pressable>
  );
}

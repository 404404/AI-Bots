import { Pressable } from 'react-native';
import { useDesignTheme } from '../design/theme';
import { NavigationMaterial } from './navigation-material';
import { CloseIcon, PlusIcon } from './icons';

export type NavigationActionProps = {
  size: number;
  label: string;
  close?: boolean;
  onPress(): void;
};
export function NavigationAction({ size, label, close = false, onPress }: NavigationActionProps) {
  const theme = useDesignTheme();
  const Icon = close ? CloseIcon : PlusIcon;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}
    >
      <NavigationMaterial circle />
      <Icon color={theme.color.fg} size={theme.type.title.line} />
    </Pressable>
  );
}

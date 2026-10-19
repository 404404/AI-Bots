import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { pressTint, useDesignTheme, type DesignTheme } from '../design/theme';
import { radius } from '../design/tokens';

export function composerPrimary(theme: DesignTheme): { fill: string; ink: string } {
  return { fill: theme.color.accent, ink: theme.color.onAccent };
}

export const micAlwaysFilled = false;

export const rippleFeedback = true;

export function ComposerCircleButton({
  label,
  testID,
  size,
  onPress,
  children,
}: {
  label: string;
  testID?: string;
  size: number;
  onPress(): void;
  children: ReactNode;
}) {
  const theme = useDesignTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      testID={testID}
      onPress={onPress}
      android_ripple={{ color: pressTint(theme.color.fg), borderless: true, radius: size / 2 }}
      style={{
        width: size,
        height: size,
        borderRadius: radius.round,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {children}
    </Pressable>
  );
}

export function ComposerFieldMaterial({ cornerRadius }: { cornerRadius: number }) {
  const theme = useDesignTheme();
  return (
    <View
      pointerEvents="none"
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={[
        StyleSheet.absoluteFill,
        { borderRadius: cornerRadius, backgroundColor: theme.layer.raised.fill },
      ]}
    />
  );
}

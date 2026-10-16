import { Stack } from 'expo-router';

import { useDesignTheme } from '../design/theme';

export function TabStack({ onAppear }: { onAppear?(): void } = {}) {
  const theme = useDesignTheme();
  return (
    <Stack
      screenListeners={({ navigation }) => ({
        transitionEnd: (event) => {
          if (!event.data.closing && navigation.isFocused()) onAppear?.();
        },
      })}
      screenOptions={{
        headerLargeTitleEnabled: true,
        headerShadowVisible: false,
        headerLargeTitleShadowVisible: false,
        headerStyle: { backgroundColor: theme.color.base },
        headerTintColor: theme.color.fg,
        contentStyle: { backgroundColor: theme.color.base },
      }}
    />
  );
}

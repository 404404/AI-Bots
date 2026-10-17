import { useMemo, type ReactNode } from 'react';
import { SafeAreaInsetsContext, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';

import { useDesignTheme } from '../design/theme';
import { SheetScreen } from './sheet-screen';

export function SheetStack({ children }: { children: ReactNode }) {
  const theme = useDesignTheme();
  const insets = useSafeAreaInsets();
  const contentInsets = useMemo(() => ({ ...insets, top: 0 }), [insets]);
  return (
    <SheetScreen>
      <SafeAreaInsetsContext value={contentInsets}>
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: theme.overlay.fill },
            headerTintColor: theme.color.fg,
            headerShadowVisible: false,
            headerBackButtonDisplayMode: 'minimal',
            contentStyle: { backgroundColor: theme.overlay.fill },
          }}
        >
          {children}
        </Stack>
      </SafeAreaInsetsContext>
    </SheetScreen>
  );
}

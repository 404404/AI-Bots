import type { ReactNode } from 'react';
import { useRouter } from 'expo-router';
import { Platform, Pressable, View } from 'react-native';

import { useDesignTheme } from '../design/theme';
import { radius, sheetHandle, space } from '../design/tokens';
import { t } from '../strings';
import type { RefCallback } from 'react';

export function ProfileSheet({
  children,
  onMount,
}: {
  children: ReactNode;
  onMount?: RefCallback<View>;
}) {
  const theme = useDesignTheme();
  const router = useRouter();
  if (Platform.OS !== 'android')
    return (
      <View ref={onMount} style={{ flex: 1 }}>
        {children}
      </View>
    );
  return (
    <View ref={onMount} style={{ flex: 1, backgroundColor: theme.color.surface }}>
      <Pressable
        testID="profile-sheet-handle"
        accessibilityRole="button"
        accessibilityLabel={t.close}
        onPress={() => router.back()}
        style={{
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: theme.touch,
          paddingVertical: space.x3,
        }}
      >
        <View
          style={{
            width: sheetHandle.width,
            height: sheetHandle.height,
            borderRadius: radius.round,
            backgroundColor: theme.color.muted,
          }}
        />
      </Pressable>
      {children}
    </View>
  );
}

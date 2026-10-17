import type { ReactNode, RefCallback } from 'react';
import { useRouter } from 'expo-router';
import { Platform, Pressable, View, type ViewInstance } from 'react-native';

import type { DesignTheme } from '../design/theme';
import { useDesignTheme } from '../design/theme';
import { radius, space } from '../design/tokens';
import { t } from '../strings';
import { SheetGrabber } from './sheet-grabber';

export function sheetScreenOptions(theme: DesignTheme, full = false) {
  return {
    headerShown: false,
    presentation: 'formSheet' as const,
    sheetAllowedDetents: full ? [1] : [0.75, 1],
    sheetGrabberVisible: true,
    contentStyle: { backgroundColor: theme.overlay.fill },
    ...(Platform.OS === 'android' ? { sheetCornerRadius: radius.xl } : {}),
  };
}

export function SheetScreen({
  children,
  onMount,
  onClose,
  modalGrabber = false,
}: {
  children: ReactNode;
  onMount?: RefCallback<ViewInstance>;
  onClose?: () => void;
  modalGrabber?: boolean;
}) {
  const theme = useDesignTheme();
  const router = useRouter();
  return (
    <View
      ref={onMount}
      onAccessibilityEscape={onClose}
      style={{ flex: 1, backgroundColor: theme.overlay.fill }}
    >
      {Platform.OS === 'ios' && modalGrabber ? (
        <View
          testID="sheet-modal-handle"
          accessible={false}
          pointerEvents="none"
          style={{ alignItems: 'center', paddingVertical: space.x3 }}
        >
          <SheetGrabber />
        </View>
      ) : null}
      {Platform.OS === 'android' ? (
        <Pressable
          testID="sheet-screen-handle"
          accessibilityRole="button"
          accessibilityLabel={t.close}
          onPress={onClose ?? (() => router.back())}
          style={{
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: theme.touch,
            paddingVertical: space.x3,
          }}
        >
          <SheetGrabber />
        </Pressable>
      ) : null}
      {children}
    </View>
  );
}

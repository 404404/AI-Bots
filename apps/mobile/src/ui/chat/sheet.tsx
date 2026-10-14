import type { ReactNode } from 'react';
import { ActivityIndicator, Modal, Pressable, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { edge, radius, space } from '../design/tokens';
import { useDesignTheme } from '../design/theme';
import { Button } from '../primitives/button';
import { Text } from '../primitives/text';
import { t } from '../strings';

export function Sheet({
  visible,
  label,
  title,
  onClose,
  children,
}: {
  visible: boolean;
  label: string;
  title?: string;
  onClose(): void;
  children: ReactNode;
}) {
  const theme = useDesignTheme();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      {visible ? (
        <View style={{ flex: 1, justifyContent: 'flex-end' }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t.cancel}
            onPress={onClose}
            style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }}
          />
          <View
            accessibilityViewIsModal
            accessibilityLabel={label}
            onAccessibilityEscape={onClose}
            style={{
              maxHeight: height - insets.top - theme.touch,
              backgroundColor: theme.layer.sheet.fill,
              borderTopLeftRadius: radius.lg,
              borderTopRightRadius: radius.lg,
              borderTopWidth: edge.hairline,
              borderColor: theme.layer.sheet.edge,
              paddingTop: space.x4,
              paddingBottom: Math.max(insets.bottom, space.x4),
              overflow: 'hidden',
            }}
          >
            {title === undefined ? null : (
              <Text
                variant="title"
                accessibilityRole="header"
                numberOfLines={1}
                style={{ paddingHorizontal: space.x5, paddingBottom: space.x3 }}
              >
                {title}
              </Text>
            )}
            {children}
          </View>
        </View>
      ) : null}
    </Modal>
  );
}

export function SheetNote({
  children,
  tone = 'muted',
}: {
  children: string;
  tone?: 'muted' | 'warning' | 'danger';
}) {
  return (
    <Text
      variant="meta"
      tone={tone}
      accessibilityLiveRegion={tone === 'muted' ? undefined : 'polite'}
      style={{ paddingHorizontal: space.x5, paddingVertical: space.x2 }}
    >
      {children}
    </Text>
  );
}

export function SheetHeading({ children }: { children: string }) {
  return (
    <Text
      variant="meta"
      tone="muted"
      accessibilityRole="header"
      style={{ paddingHorizontal: space.x5, paddingTop: space.x4, paddingBottom: space.x2 }}
    >
      {children}
    </Text>
  );
}

export function SheetLoading() {
  return (
    <View style={{ padding: space.x6, alignItems: 'center' }}>
      <ActivityIndicator />
    </View>
  );
}

export function SheetFailed({ message, onRetry }: { message: string; onRetry(): void }) {
  return (
    <View style={{ gap: space.x3, paddingHorizontal: space.x5, paddingBottom: space.x3 }}>
      <Text tone="danger">{message}</Text>
      <Button label={t.tryAgain} on="sheet" onPress={onRetry} />
    </View>
  );
}

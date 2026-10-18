import type { ReactNode } from 'react';
import { View, type ColorValue } from 'react-native';
import { space } from '../design/tokens';
import { Text } from '../primitives/text';
import { badgeCount } from '../primitives/badge-count';

export function NavigationIcon({
  children,
  color,
  count = 0,
}: {
  children: ReactNode;
  focused: boolean;
  color: ColorValue;
  count?: number;
  countVisible?: boolean;
}) {
  return (
    <View
      accessibilityElementsHidden
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: space.x2,
      }}
    >
      {children}
      {count > 0 && (
        <Text variant="meta" strong style={{ color }}>
          {badgeCount(count)}
        </Text>
      )}
    </View>
  );
}

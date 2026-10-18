import { Capsule, Host } from '@expo/ui/swift-ui';
import { accessibilityHidden, foregroundStyle, glassEffect } from '@expo/ui/swift-ui/modifiers';
import { useEffect, useState } from 'react';
import { AccessibilityInfo, Platform, StyleSheet, View } from 'react-native';

import { edge, radius } from '../design/tokens';
import { useDesignTheme } from '../design/theme';

export function DrawerMaterial() {
  const theme = useDesignTheme();
  // Start opaque until the system preference is known. Text stays in the RN tree.
  const [reduceTransparency, setReduceTransparency] = useState(true);
  useEffect(() => {
    let active = true;
    let changed = false;
    const subscription = AccessibilityInfo.addEventListener(
      'reduceTransparencyChanged',
      (value) => {
        changed = true;
        setReduceTransparency(value);
      },
    );
    void AccessibilityInfo.isReduceTransparencyEnabled().then(
      (value) => {
        if (active && !changed) setReduceTransparency(value);
      },
      () => {},
    );
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);
  const glass = Number.parseInt(String(Platform.Version), 10) >= 26 && !reduceTransparency;
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      style={[
        StyleSheet.absoluteFill,
        {
          borderRadius: radius.round,
          borderWidth: glass ? 0 : edge.hairline,
          borderColor: theme.layer.raised.edge,
          backgroundColor: glass ? 'transparent' : theme.layer.raised.fill,
        },
      ]}
    >
      {glass ? (
        <Host style={StyleSheet.absoluteFill} colorScheme={theme.scheme} pointerEvents="none">
          <Capsule
            modifiers={[
              foregroundStyle('transparent'),
              glassEffect({ glass: { variant: 'regular' }, shape: 'capsule' }),
              accessibilityHidden(),
            ]}
          />
        </Host>
      ) : null}
    </View>
  );
}

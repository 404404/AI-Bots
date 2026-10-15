import { useIsFocused } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { headerBand, useDesignTheme } from '../design/theme';
import { radius, space } from '../design/tokens';
import { useMounted } from '../mounted';
import { Text } from '../primitives/text';
import { t } from '../strings';
import { focusOn, hostDrawer, openHostDrawer, useHostDrawerOpen } from './host-drawer';
import { ChevronDownIcon } from './icons';

export function HomeHeader({ hostName, children }: { hostName: string; children: ReactNode }) {
  const theme = useDesignTheme();
  const focused = useIsFocused();
  const drawerOpen = useHostDrawerOpen();
  const insets = useSafeAreaInsets();
  const band = headerBand(theme.scheme, theme.color);
  const ink = theme.color[band.ink];
  const tile = theme.touch - space.x2;
  const chip = useMounted<View>((node) => {
    hostDrawer.setReturnFocus(() => focusOn(node));
    return () => hostDrawer.setReturnFocus(undefined);
  }, []);
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: band.bottom,
        experimental_backgroundImage: `linear-gradient(180deg, ${band.top} 0%, ${band.bottom} 40%)`,
      }}
    >
      {focused ? <StatusBar style={band.lightInk ? 'light' : 'dark'} /> : null}
      <Pressable
        ref={chip}
        onPress={openHostDrawer}
        accessibilityRole="button"
        accessibilityLabel={t.switchComputer(hostName)}
        accessibilityState={{ expanded: drawerOpen }}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          gap: space.x4,
          paddingTop: insets.top + space.x4,
          paddingBottom: space.x5,
          paddingHorizontal: space.x5,
          opacity: pressed ? 0.7 : 1,
        })}
      >
        <View
          style={{
            width: tile,
            height: tile,
            borderRadius: radius.md,
            backgroundColor: ink,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text variant="title" style={{ color: band.top }}>
            {Array.from(hostName.trim())[0]?.toUpperCase() ?? '?'}
          </Text>
        </View>
        <Text variant="display" tone={band.ink} numberOfLines={1} style={{ flexShrink: 1 }}>
          {hostName}
        </Text>
        <ChevronDownIcon color={ink} size={theme.type.title.size + space.x2} />
      </Pressable>
      <View
        style={{
          flex: 1,
          backgroundColor: theme.color.base,
          borderTopLeftRadius: radius.lg,
          borderTopRightRadius: radius.lg,
          overflow: 'hidden',
        }}
      >
        {children}
      </View>
    </View>
  );
}

import { BottomTabBar, Tabs } from 'expo-router/js-tabs';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { actionCount } from '../../src/host/inbox';
import { useHostSession, useInbox } from '../../src/host/host-session';
import { EdgeFade } from '../../src/ui/chat/header-chrome';
import { glassShadow, useDesignTheme } from '../../src/ui/design/theme';
import { edge, edgeFade, navigationBar, radius, space } from '../../src/ui/design/tokens';
import { FloatingTabInset } from '../../src/ui/shell/floating-tab-inset';
import { HostDrawer } from '../../src/ui/shell/host-drawer';
import { ActivityIcon, ChatsIcon } from '../../src/ui/shell/icons';
import { t } from '../../src/ui/strings';

export default function TabsLayout() {
  const theme = useDesignTheme();
  const insets = useSafeAreaInsets();
  const { inbox } = useHostSession();
  const pending = actionCount(useInbox(inbox));
  const height = navigationBar.height;
  const bottom = Math.max(insets.bottom, space.x4);
  const reserved = height + bottom + space.x5;
  return (
    <FloatingTabInset.Provider value={reserved}>
      <View style={{ flex: 1, backgroundColor: theme.color.base }}>
        <Tabs
          safeAreaInsets={{ bottom: 0 }}
          tabBar={(props) => (
            <View
              pointerEvents="box-none"
              style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: reserved }}
            >
              <EdgeFade edge="bottom" height={reserved + edgeFade.bottom} />
              <BottomTabBar {...props} />
            </View>
          )}
          screenOptions={{
            headerShown: false,
            tabBarActiveTintColor: theme.color.fg,
            tabBarInactiveTintColor: theme.color.muted,
            tabBarStyle: {
              position: 'absolute',
              marginHorizontal: space.x6,
              bottom,
              height,
              paddingVertical: navigationBar.itemPadding,
              paddingHorizontal: space.x2,
              borderRadius: radius.round,
              borderTopWidth: edge.hairline,
              borderWidth: edge.hairline,
              borderColor: theme.layer.raised.edge,
              borderTopColor: theme.layer.raised.edge,
              backgroundColor: theme.layer.raised.fill,
              boxShadow: glassShadow(theme.scheme),
            },
            tabBarItemStyle: {
              borderRadius: radius.round,
              overflow: 'hidden',
              minHeight: theme.touch,
            },
            tabBarLabelStyle: { fontSize: theme.type.meta.size },
            tabBarLabelPosition: 'below-icon',
            sceneStyle: { backgroundColor: theme.color.base },
          }}
        >
          <Tabs.Screen
            name="(home)"
            options={{
              title: t.chats,
              tabBarIcon: ({ color, focused }) => (
                <View
                  style={{
                    width: navigationBar.indicatorWidth,
                    height: navigationBar.indicatorHeight,
                    borderRadius: radius.round,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: focused ? theme.layer.raised.selected : undefined,
                  }}
                >
                  <ChatsIcon color={color} size={theme.type.title.line} />
                </View>
              ),
            }}
          />
          <Tabs.Screen
            name="(activity)"
            options={{
              title: t.activity,
              tabBarIcon: ({ color, focused }) => (
                <View
                  style={{
                    width: navigationBar.indicatorWidth,
                    height: navigationBar.indicatorHeight,
                    borderRadius: radius.round,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: focused ? theme.layer.raised.selected : undefined,
                  }}
                >
                  <ActivityIcon color={color} size={theme.type.title.line} />
                </View>
              ),
              ...(pending > 0 ? { tabBarBadge: pending } : {}),
            }}
          />
        </Tabs>
        <HostDrawer />
      </View>
    </FloatingTabInset.Provider>
  );
}

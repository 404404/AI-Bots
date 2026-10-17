import { useState } from 'react';
import { Animated, I18nManager, Pressable, View } from 'react-native';
import type { SceneRendererProps } from 'react-native-tab-view';
import { useDesignTheme } from '../design/theme';
import { edge, space } from '../design/tokens';
import { Text } from '../primitives/text';
import { t } from '../strings';
import type { ActivitySection } from './activity-filters';
import { ActivityIcon, ChatsIcon, PersonIcon } from './icons';

export const ACTIVITY_TABS = [{ key: 'action' }, { key: 'replies' }, { key: 'unread' }] as const;
export type ActivityTab = (typeof ACTIVITY_TABS)[number];
const ICONS = { action: ActivityIcon, replies: PersonIcon, unread: ChatsIcon };

export function ActivityTabs({
  selected,
  position,
  onSelect,
}: {
  selected: ActivitySection;
  position: SceneRendererProps['position'];
  onSelect(section: ActivityTab['key']): void;
}) {
  const theme = useDesignTheme();
  const [width, setWidth] = useState(0);
  const tabWidth = width / ACTIVITY_TABS.length;
  const iconSize = theme.type.body.line;
  return (
    <View
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      style={{ backgroundColor: theme.color.base }}
    >
      <View style={{ flexDirection: 'row' }}>
        {ACTIVITY_TABS.map(({ key }) => {
          const Icon = ICONS[key];
          return (
            <Pressable
              key={key}
              accessibilityRole="tab"
              accessibilityLabel={t.inboxSections[key]}
              accessibilityState={{ selected: selected === key }}
              onPress={() => onSelect(key)}
              android_ripple={{ color: theme.layer.canvas.pressed }}
              style={({ pressed }) => ({
                flex: 1,
                minWidth: 0,
                minHeight: theme.touch,
                alignItems: 'center',
                justifyContent: 'center',
                paddingHorizontal: space.x2,
                paddingVertical: space.x4,
                backgroundColor: pressed ? theme.layer.canvas.pressed : theme.color.base,
              })}
            >
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: space.x2,
                }}
              >
                {selected === key ? (
                  <View
                    pointerEvents="none"
                    accessibilityElementsHidden
                    importantForAccessibility="no-hide-descendants"
                  >
                    <Icon color={theme.color.fg} size={iconSize} />
                  </View>
                ) : null}
                <Text
                  tone={selected === key ? 'fg' : 'muted'}
                  strong={selected === key}
                  style={{ flexShrink: 1, textAlign: 'center' }}
                >
                  {t.inboxSections[key]}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>
      <Animated.View
        pointerEvents="none"
        style={{
          position: 'absolute',
          bottom: 0,
          start: 0,
          height: edge.focus,
          width: tabWidth,
          backgroundColor: theme.color.accent,
          opacity: selected === 'all' || selected === 'handled' ? 0 : 1,
          transform: [
            {
              translateX: position.interpolate({
                inputRange: [0, 1, 2],
                outputRange: [0, tabWidth, 2 * tabWidth].map((x) => (I18nManager.isRTL ? -x : x)),
              }),
            },
          ],
        }}
      />
    </View>
  );
}

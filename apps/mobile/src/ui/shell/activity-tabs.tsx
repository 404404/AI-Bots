import { Pressable, ScrollView, View } from 'react-native';

import { useDesignTheme } from '../design/theme';
import { edge, space } from '../design/tokens';
import { Text } from '../primitives/text';
import { t } from '../strings';
import type { ActivitySection } from './activity-filters';
import { ActivityIcon, ChatsIcon, PersonIcon } from './icons';

const TABS = ['action', 'replies', 'unread'] as const;
const ICONS = { action: ActivityIcon, replies: PersonIcon, unread: ChatsIcon };

export function ActivityTabs({
  selected,
  onSelect,
}: {
  selected: ActivitySection;
  onSelect(section: (typeof TABS)[number]): void;
}) {
  const theme = useDesignTheme();
  const iconSize = theme.type.body.line;
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      style={{ backgroundColor: theme.color.base, flexGrow: 0 }}
      contentContainerStyle={{ flexGrow: 1 }}
    >
      {TABS.map((section) => {
        const Icon = ICONS[section];
        return (
          <Pressable
            key={section}
            accessibilityRole="tab"
            accessibilityLabel={t.inboxSections[section]}
            accessibilityState={{ selected: selected === section }}
            onPress={() => onSelect(section)}
            style={({ pressed }) => ({
              flexGrow: 1,
              minHeight: theme.touch,
              alignItems: 'center',
              justifyContent: 'center',
              paddingHorizontal: space.x2,
              paddingVertical: space.x4,
              backgroundColor: pressed ? theme.layer.canvas.pressed : theme.color.base,
            })}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.x2 }}>
              <View
                pointerEvents="none"
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
                style={{ width: iconSize, height: iconSize }}
              >
                {selected === section ? <Icon color={theme.color.fg} size={iconSize} /> : null}
              </View>
              <Text tone={selected === section ? 'fg' : 'muted'} strong={selected === section}>
                {t.inboxSections[section]}
              </Text>
              <View style={{ width: iconSize }} />
            </View>
            <View
              style={{
                position: 'absolute',
                bottom: 0,
                left: space.x5,
                right: space.x5,
                height: edge.focus,
                backgroundColor: selected === section ? theme.color.accent : 'transparent',
              }}
            />
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

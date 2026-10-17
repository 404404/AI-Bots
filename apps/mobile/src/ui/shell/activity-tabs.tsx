import { Pressable, ScrollView, View } from 'react-native';

import { useDesignTheme } from '../design/theme';
import { edge, space } from '../design/tokens';
import { Text } from '../primitives/text';
import { t } from '../strings';
import type { ActivitySection } from './activity-filters';

const TABS = ['action', 'replies', 'unread'] as const;

export function ActivityTabs({
  selected,
  onSelect,
}: {
  selected: ActivitySection;
  onSelect(section: (typeof TABS)[number]): void;
}) {
  const theme = useDesignTheme();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      style={{ backgroundColor: theme.color.base, flexGrow: 0 }}
      contentContainerStyle={{ flexGrow: 1 }}
    >
      {TABS.map((section) => (
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
            paddingHorizontal: space.x5,
            paddingVertical: space.x4,
            backgroundColor: pressed ? theme.layer.canvas.pressed : theme.color.base,
          })}
        >
          <Text tone={selected === section ? 'fg' : 'muted'} strong={selected === section}>
            {t.inboxSections[section]}
          </Text>
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
      ))}
    </ScrollView>
  );
}

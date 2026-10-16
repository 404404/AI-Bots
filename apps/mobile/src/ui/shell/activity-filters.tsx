import { FlatList, Pressable, View } from 'react-native';

import { INBOX_SECTIONS, type InboxSection } from '../../host/inbox';
import { useDesignTheme } from '../design/theme';
import { space } from '../design/tokens';
import { Text } from '../primitives/text';
import { t } from '../strings';
import { Sheet } from '../chat/sheet';
import { Button } from '../primitives/button';

export type ActivitySection = 'all' | InboxSection;

export type ActivityFilter = {
  section: ActivitySection;
  bot: string | undefined;
  channel?: string | undefined;
  unreadOnly?: boolean;
};
export type ActivitySort = 'default' | 'newest' | 'oldest';

export const ALL_ACTIVITY: ActivityFilter = { section: 'all', bot: undefined };

const SECTIONS: readonly ActivitySection[] = ['all', ...INBOX_SECTIONS];

export function ActivityOption({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress(): void;
}) {
  const theme = useDesignTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: theme.touch,
        paddingHorizontal: space.x5,
        paddingVertical: space.x3,
        backgroundColor: selected
          ? theme.layer.canvas.chosen
          : pressed
            ? theme.layer.canvas.pressed
            : theme.layer.canvas.fill,
      })}
    >
      <Text strong={selected} tone={selected ? 'accent' : 'fg'}>
        {label}
      </Text>
    </Pressable>
  );
}

export function ActivityFilters({
  visible,
  bots,
  channels,
  filter,
  onFilter,
  onClose,
}: {
  visible: boolean;
  bots: ReadonlyArray<{ slug: string; name: string }>;
  channels: ReadonlyArray<{ id: string; name: string }>;
  filter: ActivityFilter;
  onFilter(next: ActivityFilter): void;
  onClose(): void;
}) {
  const options = [
    ...SECTIONS.map((section) => ({
      key: `section:${section}`,
      label: section === 'all' ? t.filterAll : t.inboxSections[section],
      selected: filter.section === section,
      choose: () => onFilter({ ...filter, section }),
    })),
    {
      key: 'read',
      label: t.activityUnreadOnly,
      selected: filter.unreadOnly === true,
      choose: () => onFilter({ ...filter, unreadOnly: !filter.unreadOnly }),
    },
    {
      key: 'bot:all',
      label: t.filterAllBots,
      selected: filter.bot === undefined,
      choose: () => onFilter({ ...filter, bot: undefined }),
    },
    ...bots.map((bot) => ({
      key: `bot:${bot.slug}`,
      label: bot.name,
      selected: filter.bot === bot.slug,
      choose: () => onFilter({ ...filter, bot: filter.bot === bot.slug ? undefined : bot.slug }),
    })),
    {
      key: 'channel:all',
      label: t.activityAllChannels,
      selected: filter.channel === undefined,
      choose: () => onFilter({ ...filter, channel: undefined }),
    },
    ...channels.map((channel) => ({
      key: `channel:${channel.id}`,
      label: channel.name,
      selected: filter.channel === channel.id,
      choose: () =>
        onFilter({ ...filter, channel: filter.channel === channel.id ? undefined : channel.id }),
    })),
  ];
  return (
    <Sheet visible={visible} label={t.filterActivity} title={t.filterActivity} onClose={onClose}>
      <View style={{ paddingHorizontal: space.x5, paddingBottom: space.x3 }}>
        <Button label={t.activityClearFilters} onPress={() => onFilter(ALL_ACTIVITY)} />
      </View>
      <FlatList
        data={options}
        keyExtractor={(item) => item.key}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => (
          <ActivityOption label={item.label} selected={item.selected} onPress={item.choose} />
        )}
      />
    </Sheet>
  );
}

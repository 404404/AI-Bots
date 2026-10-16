import { useState } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HeaderCircleButton } from '../chat/header-chrome';
import { Sheet } from '../chat/sheet';
import { useDesignTheme } from '../design/theme';
import { space } from '../design/tokens';
import { SearchField } from '../primitives/search-field';
import { Text } from '../primitives/text';
import { t } from '../strings';
import { ActivityOption, type ActivitySort } from './activity-filters';
import { ActivityFilterIcon, ActivitySearchIcon, ActivitySortIcon, CloseIcon } from './icons';

export function ActivityToolbar({
  search,
  sort,
  filtered,
  onSearch,
  onSort,
  onFilter,
  onHeight,
}: {
  search: string;
  sort: ActivitySort;
  filtered: boolean;
  onSearch(value: string): void;
  onSort(value: ActivitySort): void;
  onFilter(): void;
  onHeight(height: number): void;
}) {
  const theme = useDesignTheme();
  const insets = useSafeAreaInsets();
  const [searching, setSearching] = useState(false);
  const [sorting, setSorting] = useState(false);
  const options = [
    { value: 'default' as const, label: t.activitySortDefault },
    { value: 'newest' as const, label: t.activitySortNewest },
    { value: 'oldest' as const, label: t.activitySortOldest },
  ];
  return (
    <>
      <View
        onLayout={(event) => onHeight(event.nativeEvent.layout.height)}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          paddingTop: insets.top + space.x2,
          paddingBottom: space.x2,
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: space.x2,
            paddingHorizontal: space.x4,
          }}
        >
          <Text
            variant="title"
            strong
            accessibilityRole="header"
            numberOfLines={1}
            style={{ flex: 1 }}
          >
            {t.activity}
          </Text>
          <HeaderCircleButton label={t.activitySort} onPress={() => setSorting(true)}>
            <ActivitySortIcon
              color={sort === 'default' ? theme.color.fg : theme.color.accent}
              size={theme.type.title.size}
            />
          </HeaderCircleButton>
          <HeaderCircleButton label={t.filterActivity} onPress={onFilter} selected={filtered}>
            <ActivityFilterIcon
              color={filtered ? theme.color.accent : theme.color.fg}
              size={theme.type.title.size}
            />
          </HeaderCircleButton>
          <HeaderCircleButton
            label={searching ? t.close : t.activitySearch}
            onPress={() => {
              setSearching(!searching);
              if (searching) onSearch('');
            }}
          >
            {searching ? (
              <CloseIcon color={theme.color.fg} size={theme.type.title.size} />
            ) : (
              <ActivitySearchIcon
                color={search ? theme.color.accent : theme.color.fg}
                size={theme.type.title.size}
              />
            )}
          </HeaderCircleButton>
        </View>
        {searching ? (
          <SearchField
            value={search}
            inset={space.x4}
            placeholder={t.activitySearch}
            onChangeText={(value) => onSearch(value.slice(0, 200))}
          />
        ) : null}
      </View>
      <Sheet
        visible={sorting}
        label={t.activitySort}
        title={t.activitySort}
        onClose={() => setSorting(false)}
      >
        {options.map((option) => (
          <ActivityOption
            key={option.value}
            label={option.label}
            selected={sort === option.value}
            onPress={() => {
              onSort(option.value);
              setSorting(false);
            }}
          />
        ))}
      </Sheet>
    </>
  );
}

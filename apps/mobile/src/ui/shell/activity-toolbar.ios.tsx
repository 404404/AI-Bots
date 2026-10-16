import { Stack } from 'expo-router';
import { useImperativeHandle, useState } from 'react';
import { Keyboard, TextInput, useWindowDimensions, View } from 'react-native';

import { useDesignTheme } from '../design/theme';
import { space } from '../design/tokens';
import { t } from '../strings';
import type { ActivityToolbarProps } from './activity-toolbar';
import { ActivitySearchIcon } from './icons';

export function ActivityToolbar({
  ref,
  search,
  filtered,
  onSearch,
  onSearchFocus,
  onFilter,
}: ActivityToolbarProps) {
  const theme = useDesignTheme();
  const { width } = useWindowDimensions();
  const [searching, setSearching] = useState(false);
  function dismissSearch() {
    setSearching(false);
    onSearchFocus(false);
    Keyboard.dismiss();
  }
  useImperativeHandle(ref, () => ({ dismissSearch }), [onSearchFocus]);
  return (
    <>
      <Stack.Screen
        options={{
          title: searching ? '' : t.activity,
          headerShown: true,
          headerLargeTitleEnabled: false,
          headerTransparent: true,
          headerStyle: { backgroundColor: 'transparent' },
          headerBlurEffect: 'none',
          headerShadowVisible: false,
          headerTintColor: theme.color.fg,
        }}
      />
      {searching ? (
        <Stack.Toolbar placement="right">
          <Stack.Toolbar.View hidesSharedBackground={false}>
            <View
              style={{
                width: width - space.x5 * 2 - space.x3,
                height: theme.touch,
                flexDirection: 'row',
                alignItems: 'center',
                paddingHorizontal: space.x4,
                gap: space.x2,
              }}
            >
              <ActivitySearchIcon color={theme.color.muted} size={theme.type.body.size} />
              <TextInput
                autoFocus
                value={search}
                onChangeText={onSearch}
                onBlur={dismissSearch}
                maxLength={200}
                placeholder={t.activitySearch}
                accessibilityLabel={t.activitySearch}
                accessibilityRole="search"
                autoCapitalize="none"
                autoCorrect={false}
                clearButtonMode="while-editing"
                returnKeyType="search"
                placeholderTextColor={theme.color.subtle}
                style={{
                  flex: 1,
                  height: theme.touch,
                  color: theme.color.fg,
                  fontSize: theme.type.body.size,
                }}
              />
            </View>
          </Stack.Toolbar.View>
        </Stack.Toolbar>
      ) : (
        <Stack.Toolbar placement="right">
          <Stack.Toolbar.Button
            icon="line.3.horizontal.decrease"
            accessibilityLabel={t.activityOptions}
            selected={filtered}
            tintColor={filtered ? theme.color.accent : theme.color.fg}
            onPress={onFilter}
            separateBackground
          />
          <Stack.Toolbar.Button
            icon="magnifyingglass"
            accessibilityLabel={t.activitySearch}
            tintColor={search ? theme.color.accent : theme.color.fg}
            onPress={() => {
              onSearchFocus(true);
              setSearching(true);
            }}
            separateBackground
          />
        </Stack.Toolbar>
      )}
    </>
  );
}

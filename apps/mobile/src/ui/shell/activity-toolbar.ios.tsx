import { Stack } from 'expo-router';
import { useRef } from 'react';
import type { SearchBarCommands } from 'react-native-screens';

import { useDesignTheme } from '../design/theme';
import { t } from '../strings';
import type { ActivityToolbarProps } from './activity-toolbar';

export function ActivityToolbar({ search, filtered, onSearch, onFilter }: ActivityToolbarProps) {
  const theme = useDesignTheme();
  const searchBar = useRef<SearchBarCommands>(null);
  return (
    <>
      <Stack.Screen
        options={{
          title: t.activity,
          headerShown: true,
          headerLargeTitleEnabled: false,
          headerTransparent: true,
          headerStyle: { backgroundColor: 'transparent' },
          headerBlurEffect: 'none',
          headerShadowVisible: false,
          headerTintColor: theme.color.fg,
        }}
      />
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button
          icon="line.3.horizontal.decrease"
          accessibilityLabel={t.activityOptions}
          selected={filtered}
          tintColor={filtered ? theme.color.accent : theme.color.fg}
          onPress={onFilter}
          separateBackground
        />
      </Stack.Toolbar>
      <Stack.SearchBar
        ref={searchBar}
        placeholder={t.activitySearch}
        placement="integratedButton"
        allowToolbarIntegration={false}
        hideWhenScrolling={false}
        obscureBackground={false}
        onFocus={() => {
          searchBar.current?.setText(search);
          searchBar.current?.toggleCancelButton(false);
        }}
        onBlur={() => searchBar.current?.cancelSearch()}
        onChangeText={(event) => {
          const value = event.nativeEvent.text.slice(0, 200);
          if (value !== event.nativeEvent.text) searchBar.current?.setText(value);
          onSearch(value);
        }}
        onCancelButtonPress={() => {
          searchBar.current?.clearText();
          onSearch('');
        }}
      />
    </>
  );
}

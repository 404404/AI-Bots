import { Stack } from 'expo-router';
import { useImperativeHandle, useRef } from 'react';
import type { SearchBarCommands } from 'react-native-screens';

import { useDesignTheme } from '../design/theme';
import { t } from '../strings';
import type { ActivityToolbarProps } from './activity-toolbar';

export function ActivityToolbar({
  ref,
  search,
  filtered,
  onSearch,
  onFilter,
}: ActivityToolbarProps) {
  const theme = useDesignTheme();
  const searchBar = useRef<SearchBarCommands>(null);
  const searching = useRef(false);
  function dismissSearch() {
    if (!searching.current) return;
    searching.current = false;
    searchBar.current?.cancelSearch();
  }
  useImperativeHandle(
    ref,
    () => ({
      dismissSearch,
    }),
    [],
  );
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
        hideNavigationBar={false}
        obscureBackground={false}
        onFocus={() => {
          searching.current = true;
          searchBar.current?.setText(search);
          searchBar.current?.toggleCancelButton(false);
        }}
        onBlur={dismissSearch}
        onChangeText={(event) => {
          if (!searching.current) return;
          const value = event.nativeEvent.text.slice(0, 200);
          if (value !== event.nativeEvent.text) searchBar.current?.setText(value);
          onSearch(value);
        }}
        onCancelButtonPress={() => {
          searching.current = false;
        }}
      />
    </>
  );
}

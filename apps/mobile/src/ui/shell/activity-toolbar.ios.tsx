import { TextInput } from '../primitives/system-text';
import { Stack } from 'expo-router';
import { useImperativeHandle, useState } from 'react';
import { Keyboard, View } from 'react-native';

import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useDesignTheme } from '../design/theme';
import { edge, radius, space } from '../design/tokens';
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
  onHeight,
}: ActivityToolbarProps) {
  const theme = useDesignTheme();
  const insets = useSafeAreaInsets();
  const [searching, setSearching] = useState(false);
  function dismissSearch() {
    setSearching(false);
    onHeight(0);
    onSearchFocus(false);
    Keyboard.dismiss();
  }
  useImperativeHandle(ref, () => ({ dismissSearch }), [onSearchFocus, onHeight]);
  return (
    <>
      <Stack.Screen
        options={{
          title: searching ? '' : t.activity,
          headerShown: !searching,
          headerLargeTitleEnabled: false,
          headerTransparent: true,
          headerStyle: { backgroundColor: 'transparent' },
          headerBlurEffect: 'none',
          headerShadowVisible: false,
          headerTintColor: theme.color.fg,
        }}
      />
      {searching ? (
        <View
          onLayout={(event) => onHeight(event.nativeEvent.layout.height)}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            paddingTop: insets.top + space.x2,
            paddingBottom: space.x2,
            paddingHorizontal: space.x5,
            backgroundColor: theme.color.base,
          }}
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: space.x2,
              paddingHorizontal: space.x4,
              borderRadius: radius.round,
              borderWidth: edge.hairline,
              borderColor: theme.layer.raised.edge,
              backgroundColor: theme.layer.raised.fill,
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
                minHeight: theme.touch,
                paddingVertical: space.x3,
                color: theme.color.fg,
                fontSize: theme.type.body.size,
                lineHeight: theme.type.body.line,
              }}
            />
          </View>
        </View>
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

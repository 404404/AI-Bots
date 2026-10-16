import type { ReactNode } from 'react';
import { TextInput, View } from 'react-native';

import { useDesignTheme } from '../design/theme';
import { radius, space } from '../design/tokens';

export function SearchField({
  trailing,
  autoFocus,
  onBlur,
  value,
  inset,
  placeholder,
  onChangeText,
}: {
  trailing?: ReactNode;
  autoFocus?: boolean;
  onBlur?(): void;
  value: string;
  inset: number;
  placeholder: string;
  onChangeText(text: string): void;
}) {
  const theme = useDesignTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        marginHorizontal: inset,
        marginTop: inset,
        marginBottom: space.x3,
        borderRadius: radius.md,
        backgroundColor: theme.layer.raised.fill,
      }}
    >
      <TextInput
        autoFocus={autoFocus}
        onBlur={onBlur}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.color.subtle}
        accessibilityLabel={placeholder}
        accessibilityRole="search"
        autoCapitalize="none"
        autoCorrect={false}
        clearButtonMode="while-editing"
        returnKeyType="search"
        style={{
          minHeight: theme.touch,
          flex: 1,
          paddingHorizontal: space.x4,
          borderRadius: radius.md,
          backgroundColor: theme.layer.raised.fill,
          color: theme.color.fg,
          fontSize: theme.type.body.size,
        }}
      />
      {trailing}
    </View>
  );
}

import { TextInput } from 'react-native';

import { useDesignTheme } from '../design/theme';
import { radius, space } from '../design/tokens';

export function SearchField({
  value,
  placeholder,
  onChangeText,
}: {
  value: string;
  placeholder: string;
  onChangeText(text: string): void;
}) {
  const theme = useDesignTheme();
  return (
    <TextInput
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
        marginHorizontal: space.x5,
        marginVertical: space.x3,
        paddingHorizontal: space.x5,
        borderRadius: radius.round,
        backgroundColor: theme.layer.raised.fill,
        color: theme.color.fg,
        fontSize: theme.type.body.size,
      }}
    />
  );
}

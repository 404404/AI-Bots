import { TextInput } from 'react-native';

import { useDesignTheme } from '../design/theme';
import { edge, radius, space } from '../design/tokens';

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
      autoFocus
      clearButtonMode="while-editing"
      returnKeyType="search"
      style={{
        minHeight: theme.touch,
        marginHorizontal: space.x5,
        marginVertical: space.x3,
        paddingHorizontal: space.x5,
        borderRadius: radius.round,
        borderWidth: edge.hairline,
        borderColor: theme.layer.field.edge,
        backgroundColor: theme.layer.field.fill,
        color: theme.color.fg,
        fontSize: theme.type.body.size,
      }}
    />
  );
}

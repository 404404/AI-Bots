import {
  Host,
  SegmentedButton,
  SingleChoiceSegmentedButtonRow,
  Text,
} from '@expo/ui/jetpack-compose';
import { fillMaxWidth } from '@expo/ui/jetpack-compose/modifiers';
import { View } from 'react-native';

import { useDesignTheme } from '../design/theme';
import type { SegmentedProps } from './segmented';

export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
}: SegmentedProps<T>) {
  const theme = useDesignTheme();
  return (
    <View accessibilityRole="tablist" accessibilityLabel={label}>
      <Host
        matchContents={{ vertical: true }}
        colorScheme={theme.scheme}
        seedColor={theme.color.accent}
        style={{ alignSelf: 'stretch' }}
      >
        <SingleChoiceSegmentedButtonRow modifiers={[fillMaxWidth()]}>
          {options.map((option) => (
            <SegmentedButton
              key={option.value}
              selected={option.value === value}
              onClick={() => {
                if (option.value !== value) onChange(option.value);
              }}
            >
              <SegmentedButton.Label>
                <Text maxLines={1}>{option.label}</Text>
              </SegmentedButton.Label>
            </SegmentedButton>
          ))}
        </SingleChoiceSegmentedButtonRow>
      </Host>
    </View>
  );
}

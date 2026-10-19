import { Host, Picker, Text } from '@expo/ui/swift-ui';
import { accessibilityLabel, pickerStyle, tag } from '@expo/ui/swift-ui/modifiers';

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
    <Host
      key={theme.scheme}
      matchContents={{ vertical: true }}
      colorScheme={theme.scheme}
      style={{ alignSelf: 'stretch' }}
    >
      <Picker<T>
        selection={value}
        onSelectionChange={(next) => {
          if (next !== value) onChange(next);
        }}
        modifiers={[pickerStyle('segmented'), accessibilityLabel(label)]}
      >
        {options.map((option) => (
          <Text key={option.value} modifiers={[tag(option.value)]}>
            {option.label}
          </Text>
        ))}
      </Picker>
    </Host>
  );
}

import {
  Host,
  SegmentedButton,
  SingleChoiceSegmentedButtonRow,
  Text as ComposeText,
} from '@expo/ui/jetpack-compose';
import { fillMaxWidth } from '@expo/ui/jetpack-compose/modifiers';
import { View } from 'react-native';

import type { LayerName } from '../design/layers';
import { useDesignTheme } from '../design/theme';

// Material 3 segmented buttons: Compose supplies the outline, check mark,
// ripple, 48dp target and radio semantics for each option.
export function Segmented<T extends string>({
  label,
  options,
  value,
  on = 'canvas',
  onChange,
}: {
  label: string;
  options: readonly { value: T; label: string }[];
  value: T;
  on?: LayerName;
  onChange(value: T): void;
  compact?: boolean;
}) {
  const theme = useDesignTheme();
  const layer = theme.layer[on];
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label}>
      <Host
        colorScheme={theme.scheme}
        seedColor={theme.color.accent}
        matchContents={{ vertical: true }}
        style={{ width: '100%' }}
      >
        <SingleChoiceSegmentedButtonRow modifiers={[fillMaxWidth()]}>
          {options.map((option) => (
            <SegmentedButton
              key={option.value}
              selected={option.value === value}
              onClick={() => {
                if (option.value !== value) onChange(option.value);
              }}
              colors={{
                activeContainerColor: layer.chosen,
                activeContentColor: theme.color.fg,
                activeBorderColor: theme.color.muted,
                inactiveContainerColor: layer.fill,
                inactiveContentColor: theme.color.fg,
                inactiveBorderColor: theme.color.muted,
              }}
            >
              <SegmentedButton.Label>
                <ComposeText>{option.label}</ComposeText>
              </SegmentedButton.Label>
            </SegmentedButton>
          ))}
        </SingleChoiceSegmentedButtonRow>
      </Host>
    </View>
  );
}

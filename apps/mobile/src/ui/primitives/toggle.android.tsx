import { Host, Switch } from '@expo/ui/jetpack-compose';
import { semantics } from '@expo/ui/jetpack-compose/modifiers';

import { androidSettings } from '../design/tokens';
import { useDesignTheme } from '../design/theme';
import type { ToggleProps } from './toggle';

export function Toggle({ label, value, disabled = false, on = 'sheet', onChange }: ToggleProps) {
  const theme = useDesignTheme();
  return (
    <Host
      colorScheme={theme.scheme}
      seedColor={theme.color.accent}
      style={{ width: androidSettings.switchWidth, height: androidSettings.switchHeight }}
    >
      <Switch
        value={value}
        enabled={!disabled}
        onCheckedChange={onChange}
        modifiers={[semantics({ contentDescription: label })]}
        colors={{
          checkedTrackColor: theme.color.accent,
          checkedThumbColor: theme.color.onAccent,
          uncheckedTrackColor: theme.layer[on].fill,
          uncheckedThumbColor: theme.color.muted,
          uncheckedBorderColor: theme.color.muted,
        }}
      />
    </Host>
  );
}

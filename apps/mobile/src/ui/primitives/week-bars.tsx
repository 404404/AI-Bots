import { View } from 'react-native';

import type { LayerName } from '../design/layers';
import { useDesignTheme } from '../design/theme';
import { radius, space } from '../design/tokens';
import { Text } from './text';

export interface WeekBar {
  key: string;
  value: number | null;
  label?: string | undefined;
  accessibilityLabel?: string | undefined;
}

export function WeekBars({
  bars,
  height,
  on = 'sheet',
  strongLast = true,
}: {
  bars: readonly WeekBar[];
  height: number;
  on?: LayerName;
  strongLast?: boolean;
}) {
  const theme = useDesignTheme();
  const max = Math.max(0, ...bars.map((bar) => bar.value ?? 0));
  const stub = space.x2;
  const labelled = bars.some((bar) => bar.label !== undefined);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: space.x2 }}>
      {bars.map((bar, index) => {
        const filled = bar.value !== null && bar.value > 0 && max > 0;
        const size = filled ? Math.max(stub, (bar.value! / max) * height) : stub;
        const last = strongLast && index === bars.length - 1;
        return (
          <View
            key={bar.key}
            accessible={bar.accessibilityLabel !== undefined}
            accessibilityLabel={bar.accessibilityLabel}
            style={{ flex: 1, alignItems: 'stretch', gap: space.x2 }}
          >
            <View style={{ height, justifyContent: 'flex-end' }}>
              <View
                style={{
                  height: size,
                  borderRadius: radius.xs,
                  backgroundColor: filled ? theme.color.accent : theme.layer[on].inset,
                }}
              />
            </View>
            {labelled ? (
              <Text
                variant="meta"
                tone={last ? 'fg' : 'muted'}
                strong={last}
                style={{ textAlign: 'center' }}
              >
                {bar.label ?? ''}
              </Text>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

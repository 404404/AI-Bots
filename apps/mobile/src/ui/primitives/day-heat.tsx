import { View } from 'react-native';

import { shiftDay, weekStart } from '../../host/usage-days';
import { chart } from '../design/chart';
import { radius } from '../design/tokens';

const LEVELS = [1, 3, 6, 11] as const;

export function heatLevel(count: number): number {
  return LEVELS.filter((threshold) => count >= threshold).length;
}

export function heatWeeks(first: string, last: string): string[][] {
  const weeks: string[][] = [];
  for (let start = weekStart(first); start <= last; start = shiftDay(start, 7))
    weeks.push(Array.from({ length: 7 }, (_, index) => shiftDay(start, index)));
  return weeks;
}

export function DayHeat({
  first,
  last,
  counts,
  tones,
  accessibilityLabel,
}: {
  first: string;
  last: string;
  counts: ReadonlyMap<string, number>;
  tones: readonly string[];
  accessibilityLabel: string;
}) {
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
      style={{ flexDirection: 'row', gap: chart.gap }}
    >
      {heatWeeks(first, last).map((week) => (
        <View key={week[0]} style={{ flex: 1, maxWidth: chart.cell, gap: chart.gap }}>
          {week.map((day) => (
            <View
              key={day}
              style={{
                aspectRatio: 1,
                borderRadius: radius.xs / 2,
                backgroundColor:
                  day < first || day > last
                    ? 'transparent'
                    : (tones[heatLevel(counts.get(day) ?? 0)] ?? tones[0]),
              }}
            />
          ))}
        </View>
      ))}
    </View>
  );
}

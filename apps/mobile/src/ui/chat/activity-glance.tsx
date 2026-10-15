import { Pressable, View } from 'react-native';

import { weekGlance, type TokenTotal } from '../../host/bot-activity';
import type { RosterBot } from '../../host/client';
import { compactTokenCount, dayLabel, weekdayLabel } from '../../host/usage-days';
import type { ProfileActivity } from '../../host/wire';
import { botColor } from '../bot-color';
import { chart } from '../design/chart';
import { AccentProvider, useDesignTheme } from '../design/theme';
import { radius, space } from '../design/tokens';
import { DayBars } from '../primitives/day-bars';
import { Text } from '../primitives/text';
import { ChevronRightIcon } from '../shell/icons';
import { t } from '../strings';

export function tokenTotalText(total: TokenTotal, compact = true): string {
  if (total.total === null)
    return total.status === 'unknown' ? t.activityUnknown : t.activityUnavailable;
  const count = compact ? compactTokenCount(total.total) : total.total.toLocaleString();
  return total.status === 'partial' ? t.activityPartialCount(count) : count;
}

function Glance({ activity, onOpen }: { activity: ProfileActivity; onOpen(): void }) {
  const theme = useDesignTheme();
  const glance = weekGlance(activity);
  const range = t.activityRange(
    dayLabel(glance.days[0] ?? activity.today),
    dayLabel(glance.days.at(-1) ?? activity.today),
  );
  const tokens = t.activityTokens(tokenTotalText(glance.total));
  const times = t.activityCount(glance.activity.reduce((sum, value) => sum + value, 0));
  const empty = theme.layer.sheet.inset;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${t.activityHeading}, ${t.activityTokensLabel} ${tokens}, ${t.activityActivityLabel} ${times}`}
      accessibilityHint={t.activityOpen}
      onPress={onOpen}
      style={({ pressed }) => ({
        gap: space.x4,
        padding: space.x5,
        borderRadius: radius.md,
        backgroundColor: pressed ? theme.layer.sheet.pressed : theme.layer.sheet.fill,
      })}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.x3 }}>
        <Text strong style={{ flex: 1 }}>
          {t.activityTokensLabel}
        </Text>
        <ChevronRightIcon color={theme.color.muted} size={space.x5} />
      </View>
      <Text variant="display" numberOfLines={1}>
        {tokenTotalText(glance.total)}
        <Text tone="muted">{t.usageUnit}</Text>
      </Text>
      <DayBars
        bars={glance.days.map((day, index) => ({
          key: day,
          segments: [glance.tokens[index] ?? 0],
        }))}
        colors={[theme.color.accent]}
        height={chart.spark}
        empty={empty}
        accessibilityLabel={t.activityChart(t.activityTokensLabel, range, tokens)}
      />
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: space.x3 }}>
        <Text variant="meta" tone="muted" style={{ flex: 1 }}>
          {t.activityActivityLabel}
        </Text>
        <Text variant="meta" strong>
          {times}
        </Text>
      </View>
      <DayBars
        bars={glance.days.map((day, index) => ({
          key: day,
          label: weekdayLabel(day),
          segments: [glance.activity[index] ?? 0],
        }))}
        colors={[theme.color.accent]}
        height={chart.spark / 2}
        empty={empty}
        accessibilityLabel={t.activityChart(t.activityActivityLabel, range, times)}
      />
      {glance.quiet ? (
        <Text variant="meta" tone="muted">
          {t.activityQuiet}
        </Text>
      ) : null}
    </Pressable>
  );
}

export function ActivityGlance({
  bot,
  activity,
  onOpen,
}: {
  bot: RosterBot;
  activity: ProfileActivity;
  onOpen(): void;
}) {
  return (
    <AccentProvider accent={botColor(bot)}>
      <Glance activity={activity} onOpen={onOpen} />
    </AccentProvider>
  );
}

import { useCallback, useState } from 'react';
import { Pressable, View } from 'react-native';

import { compactTokens, usageWeek, weekdayOf, type OverviewUsage } from '../../host/usage';
import { useDesignTheme } from '../design/theme';
import { radius, space } from '../design/tokens';
import { useMounted } from '../mounted';
import { Text } from '../primitives/text';
import { WeekBars, type WeekBar } from '../primitives/week-bars';
import { locale, t } from '../strings';
import { ChevronRightIcon } from './icons';

export type Loaded<T> =
  | { status: 'loading'; value?: T | undefined }
  | { status: 'ready'; value: T }
  | { status: 'failed'; error: string; value?: T | undefined };

export function useLoaded<T, N>(load: (() => Promise<T>) | undefined) {
  const [state, setState] = useState<Loaded<T>>({ status: 'loading' });
  const read = useCallback(
    (next: (() => Promise<T>) | undefined = load) => {
      if (next === undefined) return () => undefined;
      let live = true;
      setState((current) => ({ status: 'loading', value: current.value }));
      next().then(
        (value) => live && setState({ status: 'ready', value }),
        (error: unknown) =>
          live &&
          setState((current) => ({
            status: 'failed',
            error: error instanceof Error ? error.message : String(error),
            value: current.value,
          })),
      );
      return () => {
        live = false;
      };
    },
    [load],
  );
  const mount = useMounted<N>(() => read(), [read]);
  return { state, read, mount };
}

export function tokenAmount(tokens: number | null): string {
  return tokens === null ? t.usageUnknown : compactTokens(tokens, locale);
}

export function dayBars(days: readonly { day: string; tokens: number | null }[]): WeekBar[] {
  return days.map(({ day, tokens }) => ({
    key: day,
    value: tokens,
    label: t.weekdayNarrow[weekdayOf(day)],
    accessibilityLabel: t.usageBar(day, tokenAmount(tokens)),
  }));
}

const EMPTY_WEEK: WeekBar[] = Array.from({ length: 7 }, (_, index) => ({
  key: String(index),
  value: null,
}));

export const CHART_HEIGHT = space.x6 * 2;

export function UsageCard({
  load,
  onOpen,
}: {
  load: (() => Promise<OverviewUsage>) | undefined;
  onOpen(): void;
}) {
  const theme = useDesignTheme();
  const { state, read, mount } = useLoaded<OverviewUsage, View>(load);
  const week = state.value === undefined ? undefined : usageWeek(state.value);
  const amount = week === undefined ? undefined : tokenAmount(week.total);
  return (
    <View ref={mount}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={amount === undefined ? t.usage : t.usageCard(amount)}
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
            {t.usage}
          </Text>
          <Text variant="meta" tone="muted">
            {t.usageWeek}
          </Text>
          <ChevronRightIcon color={theme.color.muted} size={space.x5} />
        </View>
        <Text variant="display" numberOfLines={1}>
          {amount === undefined ? '—' : amount}
          <Text tone="muted">{t.usageUnit}</Text>
        </Text>
        <WeekBars
          bars={week === undefined ? EMPTY_WEEK : dayBars(week.days)}
          height={CHART_HEIGHT}
        />
      </Pressable>
      {state.status === 'loading' && state.value === undefined ? (
        <Text
          variant="meta"
          tone="muted"
          style={{ padding: space.x3, paddingHorizontal: space.x5 }}
        >
          {t.usageLoading}
        </Text>
      ) : null}
      {state.status === 'failed' ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: space.x3,
            paddingHorizontal: space.x5,
          }}
        >
          <Text variant="meta" tone="danger" style={{ flex: 1 }}>
            {`${t.usageFailed} ${state.error}`}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t.tryAgain}
            onPress={() => read()}
            style={{ minHeight: theme.touch, justifyContent: 'center' }}
          >
            <Text tone="accent" strong>
              {t.tryAgain}
            </Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

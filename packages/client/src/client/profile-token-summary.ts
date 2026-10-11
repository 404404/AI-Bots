import type { ProfileActivity } from './bridge.js';
import type { BotHarnessTranslate } from './locale.js';

export function profileTokenSummary(activity: ProfileActivity | undefined): {
  status: 'ready' | 'unknown' | 'partial' | 'unavailable';
  total: number | null;
} {
  if (activity === undefined || activity.modelUsageStatus !== 'ready')
    return { status: 'unavailable', total: null };
  const rows = activity.modelUsageRows ?? [];
  const unknown = rows.some((row) => row.totalTokens === null);
  const partial = rows.some((row) =>
    [row.inputTokens, row.outputTokens, row.cacheReadTokens, row.cacheWriteTokens].includes(null),
  );
  if (unknown && rows.every((row) => row.totalTokens === null))
    return { status: 'unknown', total: null };
  const total = rows.reduce((sum, row) => sum + (row.totalTokens ?? 0), 0);
  return { status: unknown || partial ? 'partial' : 'ready', total };
}

export function profileTokenSummaryText(
  activity: ProfileActivity | undefined,
  t: BotHarnessTranslate,
): string {
  const summary = profileTokenSummary(activity);
  if (summary.status === 'unavailable') return t('composerContext.unavailable');
  if (summary.status === 'unknown') return t('profile.usage.unknown');
  const count = String(summary.total);
  return summary.status === 'partial' ? t('composerContext.partial', { count }) : count;
}

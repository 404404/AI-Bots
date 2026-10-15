import type { HostClient } from './client';
import type { OverviewMemory, OverviewUsage, UsageBuckets, UsagePeriod } from './wire';

export type { OverviewMemory, OverviewUsage, UsagePeriod } from './wire';

export interface UsageDay {
  day: string;
  tokens: number | null;
}

export interface UsageWeek {
  total: number | null;
  days: UsageDay[];
}

export type UsageSplitKey = 'inputTokens' | 'outputTokens' | 'cacheReadTokens' | 'cacheWriteTokens';

export const USAGE_SPLIT: readonly UsageSplitKey[] = [
  'inputTokens',
  'outputTokens',
  'cacheReadTokens',
  'cacheWriteTokens',
];

export function loadUsage(
  client: HostClient,
  period: UsagePeriod,
  after?: string,
): Promise<OverviewUsage> {
  return client.call<OverviewUsage>('overviewUsage', {
    period,
    ...(after === undefined ? {} : { after }),
  });
}

export async function loadMoreUsage(
  client: HostClient,
  current: OverviewUsage,
): Promise<OverviewUsage> {
  if (current.nextCursor === undefined) return current;
  const page = await loadUsage(client, current.period, current.nextCursor);
  if (page.start !== current.start || page.end !== current.end)
    return loadUsage(client, current.period);
  return { ...page, bots: appendBySlug(current.bots, page.bots) };
}

export function loadMemoryActivity(client: HostClient, after?: string): Promise<OverviewMemory> {
  return client.call<OverviewMemory>('overviewMemory', after === undefined ? {} : { after });
}

export async function loadMoreMemoryActivity(
  client: HostClient,
  current: OverviewMemory,
): Promise<OverviewMemory> {
  if (current.nextCursor === undefined) return current;
  const page = await loadMemoryActivity(client, current.nextCursor);
  if (page.start !== current.start || page.end !== current.end) return loadMemoryActivity(client);
  return { ...page, bots: appendBySlug(current.bots, page.bots) };
}

function appendBySlug<T extends { slug: string }>(current: readonly T[], next: readonly T[]): T[] {
  const seen = new Set(current.map((row) => row.slug));
  return [...current, ...next.filter((row) => !seen.has(row.slug))];
}

export function usageWeek(usage: OverviewUsage): UsageWeek {
  return {
    total: usage.totals.totalTokens,
    days: usage.days.map((row) => ({ day: row.day, tokens: row.totalTokens })),
  };
}

export function usageIsPartial(usage: OverviewUsage): boolean {
  const unknown = (row: UsageBuckets) => Object.values(row).some((value) => value === null);
  return unknown(usage.totals) || usage.days.some(unknown);
}

export function usageShare(tokens: number | null, total: number | null): number | undefined {
  if (tokens === null || total === null || total <= 0) return undefined;
  return Math.round((tokens / total) * 100);
}

const COMPACT = {
  en: [
    [1e9, 'B'],
    [1e6, 'M'],
    [1e3, 'K'],
  ],
  zh: [
    [1e8, '亿'],
    [1e4, '万'],
  ],
} as const;

export function compactTokens(tokens: number, locale: 'en' | 'zh'): string {
  for (const [unit, suffix] of COMPACT[locale]) {
    if (tokens < unit) continue;
    const value = tokens / unit;
    const digits = value < 10 ? 1 : 0;
    return `${Number(value.toFixed(digits)).toLocaleString('en')}${suffix}`;
  }
  return tokens.toLocaleString('en');
}

export function weekdayOf(day: string): number {
  const [year, month, date] = day.split('-').map(Number) as [number, number, number];
  return new Date(year, month - 1, date).getDay();
}

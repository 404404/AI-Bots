const DAY = /^(\d{4})-(\d{2})-(\d{2})$/u;

function dateOf(day: string): Date {
  const match = DAY.exec(day);
  if (match === null) return new Date(Number.NaN);
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function keyOf(date: Date): string {
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

export function isDay(value: unknown): value is string {
  return typeof value === 'string' && DAY.test(value) && !Number.isNaN(dateOf(value).getTime());
}

export function today(): string {
  return keyOf(new Date());
}

export function shiftDay(day: string, amount: number): string {
  const date = dateOf(day);
  date.setDate(date.getDate() + amount);
  return keyOf(date);
}

export function trailingDays(last: string, count: number): string[] {
  return Array.from({ length: count }, (_, index) => shiftDay(last, index - count + 1));
}

export function weekStart(day: string): string {
  return shiftDay(day, -((dateOf(day).getDay() + 6) % 7));
}

export function weekdayLabel(day: string, locale?: string): string {
  return dateOf(day).toLocaleDateString(locale, { weekday: 'narrow' });
}

export function dayLabel(day: string, locale?: string): string {
  return dateOf(day).toLocaleDateString(locale, { month: 'short', day: 'numeric' });
}

export function compactTokenCount(count: number): string {
  if (count < 1000) return String(count);
  const divisor = count < 999_950 ? 1000 : count < 999_950_000 ? 1_000_000 : 1_000_000_000;
  const suffix = divisor === 1000 ? 'K' : divisor === 1_000_000 ? 'M' : 'B';
  return `${Number((count / divisor).toFixed(1))}${suffix}`;
}

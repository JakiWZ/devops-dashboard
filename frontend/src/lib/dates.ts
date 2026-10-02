const DAY_MS = 24 * 60 * 60 * 1000;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Le metriche sono giornaliere in UTC (come le salva il backend): ragioniamo in date UTC. */
export function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(isoDate: string, days: number): string {
  return toIsoDate(new Date(Date.parse(`${isoDate}T00:00:00.000Z`) + days * DAY_MS));
}

export function isIsoDate(value: string | null | undefined): value is string {
  return typeof value === 'string' && ISO_DATE.test(value) && !Number.isNaN(Date.parse(value));
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS);
}

export const RANGE_PRESETS = [7, 30, 90] as const;
export const DEFAULT_RANGE_DAYS = 30;
/** Stesso limite del backend sulle metriche (366 giorni per richiesta). */
export const MAX_RANGE_DAYS = 365;

export interface Range {
  from: string;
  to: string;
}

/** Ultimi `days` giorni, oggi incluso. */
export function lastDays(days: number, today = toIsoDate(new Date())): Range {
  return { from: addDays(today, -(days - 1)), to: today };
}

/** Interpreta from/to dall'URL; valori assenti, invertiti o troppo ampi tornano al default. */
export function parseRange(
  from: string | null,
  to: string | null,
  today = toIsoDate(new Date()),
): Range {
  if (!isIsoDate(from) || !isIsoDate(to)) return lastDays(DEFAULT_RANGE_DAYS, today);
  const span = daysBetween(from, to);
  if (span < 0 || span > MAX_RANGE_DAYS) return lastDays(DEFAULT_RANGE_DAYS, today);
  return { from, to };
}

const shortDate = new Intl.DateTimeFormat('en', {
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
});
const longDate = new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeZone: 'UTC' });
const dateTime = new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' });

export function formatShortDate(isoDate: string): string {
  return shortDate.format(new Date(`${isoDate.slice(0, 10)}T00:00:00.000Z`));
}

export function formatDate(iso: string): string {
  return longDate.format(new Date(iso));
}

export function formatDateTime(iso: string): string {
  return dateTime.format(new Date(iso));
}

const HOUR_MS = 60 * 60 * 1000;
/** Oltre questo ritardo un report settimanale mancato (es. server spento) non viene recuperato. */
export const WEEKLY_CATCH_UP_MS = 24 * HOUR_MS;

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function isValidTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

/** Giorno della settimana (0 = domenica) e ora locali di un istante nel fuso indicato. */
export function localDayAndHour(date: Date, timezone: string): { day: number; hour: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
    hour: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(date);
  const weekday = parts.find((p) => p.type === 'weekday')?.value ?? '';
  const hour = Number(parts.find((p) => p.type === 'hour')?.value);
  return { day: WEEKDAYS.indexOf(weekday), hour };
}

/**
 * Inizio dell'ultima ora (≤ now) in cui, nel fuso dell'utente, era il giorno e l'ora scelti.
 * Si cerca a ritroso ora per ora: gestisce da sé ora legale e fusi non interi.
 */
export function lastWeeklySlot(
  now: Date,
  weeklyDay: number,
  weeklyHour: number,
  timezone: string,
): Date | null {
  const startOfHour = new Date(Math.floor(now.getTime() / HOUR_MS) * HOUR_MS);
  for (let back = 0; back <= 8 * 24; back += 1) {
    const candidate = new Date(startOfHour.getTime() - back * HOUR_MS);
    const { day, hour } = localDayAndHour(candidate, timezone);
    if (day === weeklyDay && hour === weeklyHour) return candidate;
  }
  return null;
}

/** Il report è dovuto se lo slot più recente non è ancora stato servito ed è abbastanza fresco. */
export function weeklyDueSlot(
  now: Date,
  prefs: { weeklyDay: number; weeklyHour: number; timezone: string; lastWeeklySentAt: Date | null },
): Date | null {
  const slot = lastWeeklySlot(now, prefs.weeklyDay, prefs.weeklyHour, prefs.timezone);
  if (!slot || now.getTime() - slot.getTime() >= WEEKLY_CATCH_UP_MS) return null;
  if (prefs.lastWeeklySentAt && prefs.lastWeeklySentAt >= slot) return null;
  return slot;
}

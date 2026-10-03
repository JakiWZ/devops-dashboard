import { isValidTimezone, lastWeeklySlot, localDayAndHour, weeklyDueSlot } from './schedule.js';

describe('weekly schedule', () => {
  it('reads the local day and hour in a time zone', () => {
    // Domenica 23:30 UTC è già lunedì a Roma.
    expect(localDayAndHour(new Date('2026-10-04T23:30:00Z'), 'Europe/Rome')).toEqual({
      day: 1,
      hour: 1,
    });
    expect(localDayAndHour(new Date('2026-10-04T23:30:00Z'), 'UTC')).toEqual({ day: 0, hour: 23 });
  });

  it('finds the last slot, following daylight saving time', () => {
    // Estate: Roma è UTC+2, inverno UTC+1.
    expect(lastWeeklySlot(new Date('2026-10-05T07:59:00Z'), 1, 8, 'Europe/Rome')).toEqual(
      new Date('2026-10-05T06:00:00Z'),
    );
    expect(lastWeeklySlot(new Date('2026-11-02T07:30:00Z'), 1, 8, 'Europe/Rome')).toEqual(
      new Date('2026-11-02T07:00:00Z'),
    );
  });

  it('is due only once per slot and only within a day', () => {
    const prefs = { weeklyDay: 1, weeklyHour: 8, timezone: 'UTC', lastWeeklySentAt: null };
    const slot = new Date('2026-10-05T08:00:00Z');
    expect(weeklyDueSlot(new Date('2026-10-05T08:10:00Z'), prefs)).toEqual(slot);
    expect(
      weeklyDueSlot(new Date('2026-10-05T08:10:00Z'), { ...prefs, lastWeeklySentAt: slot }),
    ).toBeNull();
    // Server spento per più di un giorno: niente report in ritardo, si aspetta la settimana dopo.
    expect(weeklyDueSlot(new Date('2026-10-06T09:00:00Z'), prefs)).toBeNull();
  });

  it('validates IANA time zones', () => {
    expect(isValidTimezone('America/New_York')).toBe(true);
    expect(isValidTimezone('Mars/Olympus')).toBe(false);
  });
});

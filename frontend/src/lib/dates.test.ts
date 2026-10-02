import { addDays, lastDays, parseRange } from './dates';

describe('date ranges', () => {
  it('computes the last N days including today', () => {
    expect(lastDays(7, '2026-10-02')).toEqual({ from: '2026-09-26', to: '2026-10-02' });
  });

  it('crosses month and year boundaries in UTC', () => {
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
  });

  it('accepts a valid range from the URL', () => {
    expect(parseRange('2026-09-01', '2026-09-15', '2026-10-02')).toEqual({
      from: '2026-09-01',
      to: '2026-09-15',
    });
  });

  it.each([
    [null, null],
    ['2026-09-15', '2026-09-01'],
    ['not-a-date', '2026-09-01'],
    ['2024-01-01', '2026-09-01'],
  ])('falls back to the last 30 days for from=%s to=%s', (from, to) => {
    expect(parseRange(from, to, '2026-10-02')).toEqual({ from: '2026-09-03', to: '2026-10-02' });
  });
});

import type { Metrics } from '../api/schemas';
import { aggregateMetrics, summarize } from './metrics';

function m(date: string, overrides: Partial<Metrics> = {}): Metrics {
  return {
    date: `${date}T00:00:00.000Z`,
    openIssues: 10,
    closedIssues: 1,
    openPRs: 2,
    mergedPRs: 1,
    ciPassRate: 0.9,
    ...overrides,
  };
}

describe('aggregateMetrics', () => {
  it('sums repositories per day and sorts by date', () => {
    const points = aggregateMetrics([
      [m('2026-09-02'), m('2026-09-01')],
      [m('2026-09-01', { openIssues: 5, closedIssues: 3 })],
    ]);
    expect(points.map((p) => p.date)).toEqual(['2026-09-01', '2026-09-02']);
    expect(points[0]).toMatchObject({ openIssues: 15, closedIssues: 4, openPRs: 4, mergedPRs: 2 });
  });

  it('averages CI pass rate only over repositories that had runs', () => {
    const [point] = aggregateMetrics([
      [m('2026-09-01', { ciPassRate: 0.8 })],
      [m('2026-09-01', { ciPassRate: null })],
      [m('2026-09-01', { ciPassRate: 0.95 })],
    ]);
    expect(point?.ciPassRate).toBe(87.5);
  });

  it('keeps days without any CI run as null instead of 0', () => {
    const [point] = aggregateMetrics([[m('2026-09-05', { ciPassRate: null })]]);
    expect(point?.ciPassRate).toBeNull();
  });
});

describe('summarize', () => {
  it('takes snapshots from the last day and totals daily counts', () => {
    const summary = summarize(
      aggregateMetrics([
        [
          m('2026-09-01', { openIssues: 12, closedIssues: 2, ciPassRate: 0.5 }),
          m('2026-09-02', { openIssues: 9, closedIssues: 3, ciPassRate: null }),
          m('2026-09-03', { openIssues: 8, closedIssues: 0, ciPassRate: 1 }),
        ],
      ]),
    );
    expect(summary).toEqual({
      openIssues: 8,
      openPRs: 2,
      closedIssues: 5,
      mergedPRs: 3,
      ciPassRate: 75,
    });
  });

  it('returns empty values when there is no data', () => {
    expect(summarize([])).toEqual({
      openIssues: null,
      openPRs: null,
      closedIssues: 0,
      mergedPRs: 0,
      ciPassRate: null,
    });
  });
});

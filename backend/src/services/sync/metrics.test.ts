import type { GitHubIssue } from '../github/github.types.js';
import { computeDailyMetrics, daysBetween } from './metrics.js';

const d = (iso: string) => new Date(iso);

function issue(created: string, closed: string | null = null): GitHubIssue {
  return {
    isPullRequest: false,
    createdAt: d(created),
    closedAt: closed ? d(closed) : null,
    mergedAt: null,
  };
}

function pull(created: string, closed: string | null = null, merged = false): GitHubIssue {
  return {
    isPullRequest: true,
    createdAt: d(created),
    closedAt: closed ? d(closed) : null,
    mergedAt: merged && closed ? d(closed) : null,
  };
}

describe('daysBetween', () => {
  it('returns every UTC day in the range, both ends included', () => {
    const days = daysBetween(d('2026-09-29T15:00:00Z'), d('2026-10-01T08:00:00Z'));
    expect(days.map((day) => day.toISOString().slice(0, 10))).toEqual([
      '2026-09-29',
      '2026-09-30',
      '2026-10-01',
    ]);
  });
});

describe('computeDailyMetrics', () => {
  const days = daysBetween(d('2026-09-01'), d('2026-09-03'));

  it('reconstructs end-of-day open counts from current state and closing dates', () => {
    const items = [
      issue('2026-08-01T10:00:00Z'), // aperta da prima della finestra, ancora aperta
      issue('2026-09-02T10:00:00Z'), // aperta il 2
      issue('2026-08-15T10:00:00Z', '2026-09-02T12:00:00Z'), // chiusa il 2
    ];
    const metrics = computeDailyMetrics(items, [], days);

    expect(metrics.map((m) => m.openIssues)).toEqual([2, 2, 2]);
    expect(metrics.map((m) => m.closedIssues)).toEqual([0, 1, 0]);
  });

  it('separates pull requests from issues and counts only merged PRs as merged', () => {
    const items = [
      issue('2026-09-01T09:00:00Z'),
      pull('2026-09-01T09:00:00Z'),
      pull('2026-08-30T09:00:00Z', '2026-09-01T18:00:00Z', true),
      pull('2026-08-30T09:00:00Z', '2026-09-03T18:00:00Z', false), // chiusa senza merge
    ];
    const [day1, , day3] = computeDailyMetrics(items, [], days);

    expect(day1).toMatchObject({ openIssues: 1, openPRs: 2, mergedPRs: 1 });
    expect(day3).toMatchObject({ openIssues: 1, openPRs: 1, mergedPRs: 0, closedIssues: 0 });
  });

  it('computes the CI pass rate ignoring cancelled and in-progress runs', () => {
    const runs = [
      { createdAt: d('2026-09-01T01:00:00Z'), conclusion: 'success' },
      { createdAt: d('2026-09-01T02:00:00Z'), conclusion: 'success' },
      { createdAt: d('2026-09-01T03:00:00Z'), conclusion: 'failure' },
      { createdAt: d('2026-09-01T04:00:00Z'), conclusion: 'cancelled' },
      { createdAt: d('2026-09-01T05:00:00Z'), conclusion: null },
      { createdAt: d('2026-09-02T01:00:00Z'), conclusion: 'timed_out' },
    ];
    const metrics = computeDailyMetrics([], runs, days);

    expect(metrics.map((m) => m.ciPassRate)).toEqual([0.67, 0, null]);
  });
});

import type { Metrics } from '@prisma/client';
import { makeIssue } from '../../test/helpers.js';
import { buildReportInput } from './report-input.js';

const now = new Date('2026-10-02T15:00:00Z');
const daysAgo = (n: number) => new Date(now.getTime() - n * 24 * 60 * 60 * 1000);

function metric(day: string, values: Partial<Metrics> = {}): Metrics {
  return {
    id: day,
    repositoryId: 'repo',
    date: new Date(`${day}T00:00:00Z`),
    openIssues: 10,
    closedIssues: 1,
    openPRs: 2,
    mergedPRs: 1,
    ciPassRate: null,
    ...values,
  };
}

describe('buildReportInput', () => {
  it('compares the last 7 days with the 7 before, ignoring days without CI runs', () => {
    const metrics = [
      metric('2026-09-20', { closedIssues: 9 }), // fuori da entrambe le settimane
      metric('2026-09-25', { closedIssues: 2, ciPassRate: 0.5 }),
      metric('2026-09-26', { closedIssues: 3, ciPassRate: 1 }), // ultimo giorno della precedente
      metric('2026-09-27', { closedIssues: 4, ciPassRate: 0.8, openIssues: 12 }),
      metric('2026-10-02', { closedIssues: 1, ciPassRate: null, openIssues: 11 }),
    ];
    const input = buildReportInput('acme/web', metrics, null, now);

    expect(input.thisWeek).toMatchObject({
      from: '2026-09-26',
      to: '2026-10-02',
      closedIssues: 8,
      avgCiPassRate: 0.9,
      openIssuesAtEnd: 11,
    });
    expect(input.previousWeek).toMatchObject({
      from: '2026-09-19',
      to: '2026-09-25',
      closedIssues: 11,
      avgCiPassRate: 0.5,
    });
  });

  it('flags issues idle for 30+ days and pull requests idle for 7+ days, oldest first', () => {
    const items = [
      makeIssue({ number: 1, createdAt: daysAgo(90), updatedAt: daysAgo(40) }),
      makeIssue({ number: 2, createdAt: daysAgo(90), updatedAt: daysAgo(5) }),
      makeIssue({ number: 3, createdAt: daysAgo(200), updatedAt: daysAgo(100) }),
      makeIssue({ number: 4, isPullRequest: true, createdAt: daysAgo(20), updatedAt: daysAgo(10) }),
      makeIssue({ number: 5, isPullRequest: true, createdAt: daysAgo(3), updatedAt: daysAgo(3) }),
    ];
    const input = buildReportInput('acme/web', [], items, now);

    expect(input.githubDataAvailable).toBe(true);
    expect(input.staleIssues.map((i) => i.number)).toEqual([3, 1]);
    expect(input.staleIssues[0]).toMatchObject({ ageDays: 200, daysSinceUpdate: 100 });
    expect(input.stalePullRequests.map((i) => i.number)).toEqual([4]);
  });

  it('marks GitHub data as unavailable when there is no client', () => {
    const input = buildReportInput('acme/web', [], null, now);
    expect(input).toMatchObject({
      githubDataAvailable: false,
      staleIssues: [],
      stalePullRequests: [],
    });
    expect(input.thisWeek.avgCiPassRate).toBeNull();
  });
});

import type { Metrics } from '@prisma/client';
import { issueFixture, runFixture } from '../../test/helpers.js';
import { buildReportInput, MAX_ITEMS, referenceableUrls } from './report-input.js';

const NOW = new Date('2026-10-02T12:00:00Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000);
const repository = { name: 'acme/web', url: 'https://github.com/acme/web', defaultBranch: 'main' };

function metric(day: number, overrides: Partial<Metrics> = {}): Metrics {
  const date = daysAgo(day);
  date.setUTCHours(0, 0, 0, 0);
  return {
    id: `m${day}`,
    repositoryId: 'r1',
    date,
    openIssues: 10,
    closedIssues: 1,
    openPRs: 3,
    mergedPRs: 2,
    ciPassRate: 0.9,
    ...overrides,
  };
}

describe('buildReportInput with live GitHub data', () => {
  const input = buildReportInput({
    repository,
    metrics: [metric(1), metric(0)],
    now: NOW,
    live: {
      open: [
        issueFixture({ number: 1, url: 'u/1', createdAt: daysAgo(90) }),
        issueFixture({ number: 2, url: 'u/2', createdAt: daysAgo(40) }),
        issueFixture({ number: 3, url: 'u/3', createdAt: daysAgo(2) }),
        issueFixture({
          number: 4,
          url: 'u/4',
          isPullRequest: true,
          createdAt: daysAgo(20),
          updatedAt: daysAgo(10),
        }),
        issueFixture({
          number: 5,
          url: 'u/5',
          isPullRequest: true,
          createdAt: daysAgo(3),
          updatedAt: daysAgo(1),
        }),
      ],
      closed: [
        issueFixture({ number: 6, createdAt: daysAgo(30), closedAt: daysAgo(1) }),
        issueFixture({
          number: 7,
          isPullRequest: true,
          createdAt: daysAgo(4),
          closedAt: daysAgo(2),
          mergedAt: daysAgo(2),
        }),
        issueFixture({ number: 8, createdAt: daysAgo(60), closedAt: daysAgo(20) }),
      ],
      runs: [
        runFixture({ name: 'CI', createdAt: daysAgo(1), conclusion: 'success' }),
        runFixture({ name: 'CI', createdAt: daysAgo(2), conclusion: 'failure', url: 'run/old' }),
        runFixture({ name: 'CI', createdAt: daysAgo(1), conclusion: 'failure', url: 'run/new' }),
        runFixture({ name: 'Deploy', createdAt: daysAgo(1), conclusion: 'success' }),
        runFixture({ name: 'Deploy', createdAt: daysAgo(1), conclusion: 'cancelled' }),
      ],
    },
  });

  it('counts the weekly activity from the period only', () => {
    expect(input.weekly).toEqual({
      issuesOpened: 1,
      issuesClosed: 1,
      prsOpened: 2,
      prsMerged: 1,
      openIssues: 3,
      openPRs: 2,
      ciRuns: 5,
      ciFailures: 2,
      // Le run cancellate non contano né come successo né come fallimento.
      ciPassRate: 0.5,
    });
  });

  it('flags issues open for 30+ days, oldest first', () => {
    expect(input.staleIssues.total).toBe(2);
    expect(input.staleIssues.items.map((i) => [i.number, i.ageDays])).toEqual([
      [1, 90],
      [2, 40],
    ]);
  });

  it('flags pull requests without updates for 7+ days', () => {
    expect(input.stalledPRs.items).toEqual([
      expect.objectContaining({ number: 4, daysSinceUpdate: 10, isDraft: false }),
    ]);
  });

  it('groups failing workflows and links the latest failure', () => {
    expect(input.failingWorkflows).toEqual([
      { name: 'CI', runs: 3, failures: 2, lastFailureUrl: 'run/new' },
    ]);
  });

  it('exposes only data URLs as referenceable', () => {
    expect(referenceableUrls(input)).toEqual(
      new Set(['https://github.com/acme/web', 'u/1', 'u/2', 'u/4', 'run/new']),
    );
  });
});

describe('buildReportInput limits', () => {
  it(`caps each list at ${MAX_ITEMS} items but reports the real total`, () => {
    const open = Array.from({ length: MAX_ITEMS + 5 }, (_, n) =>
      issueFixture({ number: n, createdAt: daysAgo(100 - n), title: 'x'.repeat(500) }),
    );
    const input = buildReportInput({
      repository,
      metrics: [],
      now: NOW,
      live: { open, closed: [], runs: [] },
    });
    expect(input.staleIssues.total).toBe(MAX_ITEMS + 5);
    expect(input.staleIssues.items).toHaveLength(MAX_ITEMS);
    expect(input.staleIssues.items[0]?.title).toHaveLength(200);
  });
});

describe('buildReportInput without GitHub', () => {
  it('falls back to synced metrics and leaves unknown values null', () => {
    const input = buildReportInput({
      repository,
      metrics: [
        metric(20, { closedIssues: 100 }),
        metric(2, { ciPassRate: 0.8 }),
        metric(1, { ciPassRate: null }),
        metric(0, { openIssues: 12, ciPassRate: 1 }),
      ],
      now: NOW,
      live: null,
    });
    expect(input.liveGitHubData).toBe(false);
    expect(input.weekly).toMatchObject({
      issuesOpened: null,
      issuesClosed: 3,
      prsMerged: 6,
      openIssues: 12,
      ciRuns: null,
      ciPassRate: 0.9,
    });
    expect(input.trend).toHaveLength(4);
    expect(input.staleIssues.items).toEqual([]);
  });
});

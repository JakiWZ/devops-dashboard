import { issueFixture, runFixture } from '../../test/helpers.js';
import { findAlerts } from './alerts.js';

const NOW = new Date('2026-10-05T12:00:00Z');
const HOUR = 60 * 60 * 1000;

describe('findAlerts', () => {
  const base = {
    open: [],
    runs: [],
    now: NOW,
    notBefore: new Date(0),
    ciFailures: true,
    stalledPrs: true,
  };

  it('ignores CI failures older than a day or before notifications were enabled', () => {
    const runs = [
      runFixture({
        url: 'u/1',
        conclusion: 'failure',
        createdAt: new Date(NOW.getTime() - 2 * HOUR),
      }),
      runFixture({
        url: 'u/2',
        conclusion: 'timed_out',
        createdAt: new Date(NOW.getTime() - 30 * HOUR),
      }),
      runFixture({ url: 'u/3', conclusion: 'cancelled', createdAt: NOW }),
    ];
    expect(findAlerts({ ...base, runs }).map((a) => a.key)).toEqual(['ci:u/1']);
    expect(findAlerts({ ...base, runs, notBefore: new Date(NOW.getTime() - HOUR) })).toEqual([]);
  });

  it('keys stalled PRs on their last update, so a PR that moves and stalls again re-alerts', () => {
    const pr = issueFixture({
      isPullRequest: true,
      url: 'pr/1',
      updatedAt: new Date('2026-09-20T00:00:00Z'),
    });
    const [first] = findAlerts({ ...base, open: [pr] });
    const [second] = findAlerts({
      ...base,
      open: [{ ...pr, updatedAt: new Date('2026-09-25T00:00:00Z') }],
    });
    expect(first?.key).not.toBe(second?.key);
    expect(findAlerts({ ...base, open: [pr], stalledPrs: false })).toEqual([]);
  });
});

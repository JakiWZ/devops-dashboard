import type { GitHubIssue, GitHubWorkflowRun } from '../github/github.types.js';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface DailyMetrics {
  date: Date;
  openIssues: number;
  closedIssues: number;
  openPRs: number;
  mergedPRs: number;
  ciPassRate: number | null;
}

const PASSED = new Set(['success']);
const FAILED = new Set(['failure', 'timed_out', 'startup_failure']);

export function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

/** Giorni UTC da `from` a `to` inclusi. */
export function daysBetween(from: Date, to: Date): Date[] {
  const days: Date[] = [];
  for (let d = startOfUtcDay(from); d <= to; d = addDays(d, 1)) days.push(d);
  return days;
}

function inRange(value: Date | null, start: Date, end: Date): boolean {
  return value !== null && value >= start && value < end;
}

function wasOpenAt(item: GitHubIssue, instant: Date): boolean {
  return item.createdAt < instant && (item.closedAt === null || item.closedAt >= instant);
}

/**
 * Ricostruisce le metriche giornaliere da issue/PR e run CI.
 * `items` deve contenere le issue aperte oggi più quelle chiuse dopo l'inizio della finestra:
 * ogni elemento aperto a fine giornata ricade in uno dei due insiemi.
 * Snapshot a fine giornata per gli aperti, conteggi del giorno per chiuse e merged.
 * Le issue riaperte sono approssimate con il loro stato attuale.
 */
export function computeDailyMetrics(
  items: GitHubIssue[],
  runs: GitHubWorkflowRun[],
  days: Date[],
): DailyMetrics[] {
  return days.map((date) => {
    const end = addDays(date, 1);
    const issues = items.filter((item) => !item.isPullRequest);
    const pulls = items.filter((item) => item.isPullRequest);
    const dayRuns = runs.filter((run) => inRange(run.createdAt, date, end));
    const passed = dayRuns.filter((run) => run.conclusion && PASSED.has(run.conclusion)).length;
    const failed = dayRuns.filter((run) => run.conclusion && FAILED.has(run.conclusion)).length;
    const total = passed + failed;

    return {
      date,
      openIssues: issues.filter((issue) => wasOpenAt(issue, end)).length,
      closedIssues: issues.filter((issue) => inRange(issue.closedAt, date, end)).length,
      openPRs: pulls.filter((pull) => wasOpenAt(pull, end)).length,
      mergedPRs: pulls.filter((pull) => inRange(pull.mergedAt, date, end)).length,
      ciPassRate: total === 0 ? null : Math.round((passed / total) * 100) / 100,
    };
  });
}

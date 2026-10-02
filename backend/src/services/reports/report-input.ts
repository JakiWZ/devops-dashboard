import type { Metrics, Repository } from '@prisma/client';
import type { GitHubIssue, GitHubWorkflowRun } from '../github/github.types.js';
import { addDays } from '../sync/metrics.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Finestra coperta dal report settimanale. */
export const REPORT_PERIOD_DAYS = 7;
/** Una issue aperta da più di così è tech debt candidato. */
export const STALE_ISSUE_DAYS = 30;
/** Una PR aperta senza aggiornamenti da più di così è considerata bloccata. */
export const STALLED_PR_DAYS = 7;
/** Elementi per categoria inviati al modello: bastano per ragionare, tengono il prompt piccolo. */
export const MAX_ITEMS = 15;
/** Titoli di GitHub tagliati a questa lunghezza: sono testo arbitrario degli utenti. */
const MAX_TITLE_LENGTH = 200;

export interface ReportItem {
  number: number;
  title: string;
  url: string;
  ageDays: number;
  daysSinceUpdate: number;
  isDraft?: boolean;
}

export interface FailingWorkflow {
  name: string;
  runs: number;
  failures: number;
  lastFailureUrl: string;
}

export interface ReportInput {
  repository: { name: string; url: string; defaultBranch: string | null };
  period: { from: string; to: string };
  /** false se GitHub non è collegato: il report si basa solo sulle metriche già sincronizzate. */
  liveGitHubData: boolean;
  weekly: {
    issuesOpened: number | null;
    issuesClosed: number;
    prsOpened: number | null;
    prsMerged: number;
    openIssues: number | null;
    openPRs: number | null;
    ciRuns: number | null;
    ciFailures: number | null;
    ciPassRate: number | null;
  };
  /** Ultime due settimane di metriche giornaliere, per riconoscere i trend. */
  trend: Array<{
    date: string;
    openIssues: number;
    closedIssues: number;
    openPRs: number;
    mergedPRs: number;
    ciPassRate: number | null;
  }>;
  staleIssues: { total: number; items: ReportItem[] };
  stalledPRs: { total: number; items: ReportItem[] };
  failingWorkflows: FailingWorkflow[];
}

export interface LiveGitHubData {
  open: GitHubIssue[];
  /** Issue e PR chiuse aggiornate dall'inizio del periodo. */
  closed: GitHubIssue[];
  runs: GitHubWorkflowRun[];
}

const PASSED = new Set(['success']);
const FAILED = new Set(['failure', 'timed_out', 'startup_failure']);

function days(from: Date, to: Date): number {
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / DAY_MS));
}

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function inPeriod(date: Date | null, from: Date, to: Date): boolean {
  return date !== null && date >= from && date <= to;
}

function toItem(issue: GitHubIssue, now: Date): ReportItem {
  return {
    number: issue.number,
    title: issue.title.slice(0, MAX_TITLE_LENGTH),
    url: issue.url,
    ageDays: days(issue.createdAt, now),
    daysSinceUpdate: days(issue.updatedAt, now),
    ...(issue.isPullRequest && { isDraft: issue.isDraft }),
  };
}

function failingWorkflows(runs: GitHubWorkflowRun[]): FailingWorkflow[] {
  const byName = new Map<string, FailingWorkflow & { lastFailureAt: number }>();
  for (const run of runs) {
    const entry = byName.get(run.name) ?? {
      name: run.name,
      runs: 0,
      failures: 0,
      lastFailureUrl: '',
      lastFailureAt: 0,
    };
    entry.runs += 1;
    if (run.conclusion && FAILED.has(run.conclusion)) {
      entry.failures += 1;
      if (run.createdAt.getTime() >= entry.lastFailureAt) {
        entry.lastFailureAt = run.createdAt.getTime();
        entry.lastFailureUrl = run.url;
      }
    }
    byName.set(run.name, entry);
  }
  return [...byName.values()]
    .filter((entry) => entry.failures > 0)
    .sort((a, b) => b.failures - a.failures)
    .map(({ lastFailureAt: _ignored, ...rest }) => rest);
}

/**
 * Riassume i dati grezzi nel payload inviato al modello. Il calcolo dei numeri resta qui,
 * deterministico e testato: al modello chiediamo di interpretarli, non di contarli.
 */
export function buildReportInput(params: {
  repository: Pick<Repository, 'name' | 'url' | 'defaultBranch'>;
  metrics: Metrics[];
  live: LiveGitHubData | null;
  now: Date;
}): ReportInput {
  const { repository, metrics, live, now } = params;
  const from = addDays(now, -REPORT_PERIOD_DAYS);
  const sorted = [...metrics].sort((a, b) => a.date.getTime() - b.date.getTime());
  const periodMetrics = sorted.filter((m) => m.date >= addDays(from, -1) && m.date <= now);
  const latest = sorted.at(-1) ?? null;

  const trend = sorted.slice(-14).map((m) => ({
    date: isoDay(m.date),
    openIssues: m.openIssues,
    closedIssues: m.closedIssues,
    openPRs: m.openPRs,
    mergedPRs: m.mergedPRs,
    ciPassRate: m.ciPassRate,
  }));

  if (!live) {
    const rates = periodMetrics.map((m) => m.ciPassRate).filter((r): r is number => r !== null);
    return {
      repository: { ...repository },
      period: { from: isoDay(from), to: isoDay(now) },
      liveGitHubData: false,
      weekly: {
        issuesOpened: null,
        issuesClosed: periodMetrics.reduce((sum, m) => sum + m.closedIssues, 0),
        prsOpened: null,
        prsMerged: periodMetrics.reduce((sum, m) => sum + m.mergedPRs, 0),
        openIssues: latest?.openIssues ?? null,
        openPRs: latest?.openPRs ?? null,
        ciRuns: null,
        ciFailures: null,
        ciPassRate: rates.length
          ? Math.round((rates.reduce((a, b) => a + b, 0) / rates.length) * 100) / 100
          : null,
      },
      trend,
      staleIssues: { total: 0, items: [] },
      stalledPRs: { total: 0, items: [] },
      failingWorkflows: [],
    };
  }

  const all = [...live.open, ...live.closed];
  const issues = all.filter((i) => !i.isPullRequest);
  const pulls = all.filter((i) => i.isPullRequest);
  const periodRuns = live.runs.filter((r) => inPeriod(r.createdAt, from, now));
  const passed = periodRuns.filter((r) => r.conclusion && PASSED.has(r.conclusion)).length;
  const failed = periodRuns.filter((r) => r.conclusion && FAILED.has(r.conclusion)).length;

  const stale = live.open
    .filter((i) => !i.isPullRequest && days(i.createdAt, now) >= STALE_ISSUE_DAYS)
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const stalled = live.open
    .filter((i) => i.isPullRequest && days(i.updatedAt, now) >= STALLED_PR_DAYS)
    .sort((a, b) => a.updatedAt.getTime() - b.updatedAt.getTime());

  return {
    repository: { ...repository },
    period: { from: isoDay(from), to: isoDay(now) },
    liveGitHubData: true,
    weekly: {
      issuesOpened: issues.filter((i) => inPeriod(i.createdAt, from, now)).length,
      issuesClosed: issues.filter((i) => inPeriod(i.closedAt, from, now)).length,
      prsOpened: pulls.filter((i) => inPeriod(i.createdAt, from, now)).length,
      prsMerged: pulls.filter((i) => inPeriod(i.mergedAt, from, now)).length,
      openIssues: live.open.filter((i) => !i.isPullRequest).length,
      openPRs: live.open.filter((i) => i.isPullRequest).length,
      ciRuns: periodRuns.length,
      ciFailures: failed,
      ciPassRate: passed + failed > 0 ? Math.round((passed / (passed + failed)) * 100) / 100 : null,
    },
    trend,
    staleIssues: {
      total: stale.length,
      items: stale.slice(0, MAX_ITEMS).map((i) => toItem(i, now)),
    },
    stalledPRs: {
      total: stalled.length,
      items: stalled.slice(0, MAX_ITEMS).map((i) => toItem(i, now)),
    },
    failingWorkflows: failingWorkflows(periodRuns),
  };
}

/** URL che il report può citare: solo quelli presenti nei dati, mai inventati dal modello. */
export function referenceableUrls(input: ReportInput): Set<string> {
  return new Set(
    [
      input.repository.url,
      ...input.staleIssues.items.map((i) => i.url),
      ...input.stalledPRs.items.map((i) => i.url),
      ...input.failingWorkflows.map((w) => w.lastFailureUrl),
    ].filter(Boolean),
  );
}

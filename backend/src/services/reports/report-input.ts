import type { Metrics } from '@prisma/client';
import type { GitHubIssue } from '../github/github.types.js';
import { addDays, startOfUtcDay } from '../sync/metrics.js';

const DAY_MS = 24 * 60 * 60 * 1000;
/** Issue senza aggiornamenti da più di così sono candidate tech debt. */
export const STALE_ISSUE_DAYS = 30;
/** PR aperte senza aggiornamenti da più di così sono considerate bloccate. */
export const STALE_PR_DAYS = 7;
const MAX_STALE_ITEMS = 15;

export interface WeekStats {
  from: string;
  to: string;
  closedIssues: number;
  mergedPRs: number;
  /** Media dei giorni con run CI; null se nella settimana non ci sono run. */
  avgCiPassRate: number | null;
  openIssuesAtEnd: number | null;
  openPRsAtEnd: number | null;
}

export interface StaleItem {
  number: number;
  title: string;
  url: string;
  ageDays: number;
  daysSinceUpdate: number;
}

/** Tutto ciò che il modello vede: solo dati aggregati e titoli, mai token o dati utente. */
export interface ReportInput {
  repository: string;
  periodStart: Date;
  periodEnd: Date;
  thisWeek: WeekStats;
  previousWeek: WeekStats;
  /** false se l'utente non ha collegato GitHub: il report si basa solo sulle metriche. */
  githubDataAvailable: boolean;
  staleIssues: StaleItem[];
  stalePullRequests: StaleItem[];
}

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function weekStats(metrics: Metrics[], from: Date, to: Date): WeekStats {
  const days = metrics
    .filter((m) => m.date >= from && m.date <= to)
    .sort((a, b) => a.date.getTime() - b.date.getTime());
  const rates = days.map((m) => m.ciPassRate).filter((r): r is number => r !== null);
  const last = days.at(-1);
  return {
    from: isoDay(from),
    to: isoDay(to),
    closedIssues: days.reduce((sum, m) => sum + m.closedIssues, 0),
    mergedPRs: days.reduce((sum, m) => sum + m.mergedPRs, 0),
    avgCiPassRate: rates.length ? round2(rates.reduce((a, b) => a + b, 0) / rates.length) : null,
    openIssuesAtEnd: last?.openIssues ?? null,
    openPRsAtEnd: last?.openPRs ?? null,
  };
}

export function findStale(items: GitHubIssue[], minIdleDays: number, now: Date): StaleItem[] {
  return items
    .filter((item) => item.closedAt === null)
    .map((item) => ({
      number: item.number,
      title: item.title,
      url: item.url,
      ageDays: Math.floor((now.getTime() - item.createdAt.getTime()) / DAY_MS),
      daysSinceUpdate: Math.floor((now.getTime() - item.updatedAt.getTime()) / DAY_MS),
    }))
    .filter((item) => item.daysSinceUpdate >= minIdleDays)
    .sort((a, b) => b.daysSinceUpdate - a.daysSinceUpdate)
    .slice(0, MAX_STALE_ITEMS);
}

/** Settimana corrente = ultimi 7 giorni UTC, oggi incluso; confrontata con i 7 precedenti. */
export function buildReportInput(
  repository: string,
  metrics: Metrics[],
  openItems: GitHubIssue[] | null,
  now: Date,
): ReportInput {
  const today = startOfUtcDay(now);
  const weekStart = addDays(today, -6);
  const previousStart = addDays(weekStart, -7);
  const previousEnd = addDays(weekStart, -1);

  return {
    repository,
    periodStart: weekStart,
    periodEnd: now,
    thisWeek: weekStats(metrics, weekStart, today),
    previousWeek: weekStats(metrics, previousStart, previousEnd),
    githubDataAvailable: openItems !== null,
    staleIssues: findStale(
      (openItems ?? []).filter((item) => !item.isPullRequest),
      STALE_ISSUE_DAYS,
      now,
    ),
    stalePullRequests: findStale(
      (openItems ?? []).filter((item) => item.isPullRequest),
      STALE_PR_DAYS,
      now,
    ),
  };
}

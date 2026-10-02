import type { Metrics } from '../api/schemas';

export interface DailyPoint {
  /** `YYYY-MM-DD` */
  date: string;
  openIssues: number;
  closedIssues: number;
  openPRs: number;
  mergedPRs: number;
  /** Percentuale 0-100, null nei giorni senza run CI. */
  ciPassRate: number | null;
}

/**
 * Somma le serie di più repository giorno per giorno. Il pass rate CI è la media dei repository
 * che hanno avuto run quel giorno: il backend non espone il numero di run, quindi non possiamo
 * pesarla, e un repository senza CI non deve abbassare la media.
 */
export function aggregateMetrics(series: Metrics[][]): DailyPoint[] {
  const byDate = new Map<string, DailyPoint & { rates: number[] }>();
  for (const metrics of series) {
    for (const m of metrics) {
      const date = m.date.slice(0, 10);
      const point = byDate.get(date) ?? {
        date,
        openIssues: 0,
        closedIssues: 0,
        openPRs: 0,
        mergedPRs: 0,
        ciPassRate: null,
        rates: [],
      };
      point.openIssues += m.openIssues;
      point.closedIssues += m.closedIssues;
      point.openPRs += m.openPRs;
      point.mergedPRs += m.mergedPRs;
      if (m.ciPassRate !== null) point.rates.push(m.ciPassRate);
      byDate.set(date, point);
    }
  }
  return [...byDate.values()]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(({ rates, ...point }) => ({
      ...point,
      ciPassRate: rates.length ? round1((average(rates) ?? 0) * 100) : null,
    }));
}

export interface MetricsSummary {
  /** Valori dell'ultimo giorno disponibile (sono conteggi istantanei). */
  openIssues: number | null;
  openPRs: number | null;
  /** Totali del periodo (le serie sono conteggi giornalieri). */
  closedIssues: number;
  mergedPRs: number;
  /** Media dei giorni con run CI, 0-100. */
  ciPassRate: number | null;
}

export function summarize(points: DailyPoint[]): MetricsSummary {
  const last = points.at(-1);
  const rates = points.map((p) => p.ciPassRate).filter((r): r is number => r !== null);
  const avg = average(rates);
  return {
    openIssues: last?.openIssues ?? null,
    openPRs: last?.openPRs ?? null,
    closedIssues: points.reduce((sum, p) => sum + p.closedIssues, 0),
    mergedPRs: points.reduce((sum, p) => sum + p.mergedPRs, 0),
    ciPassRate: avg === null ? null : round1(avg),
  };
}

function average(values: number[]): number | null {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

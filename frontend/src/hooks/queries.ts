import { useQueries, useQuery } from '@tanstack/react-query';
import { githubApi, reportsApi, reposApi, type ReportFilters } from '../api/endpoints';
import type { Range } from '../lib/dates';
import { aggregateMetrics, type DailyPoint } from '../lib/metrics';

export const queryKeys = {
  repos: ['repos'] as const,
  repo: (id: string) => ['repos', id] as const,
  metrics: (id: string, range: Range) => ['repos', id, 'metrics', range.from, range.to] as const,
  available: ['repos', 'available'] as const,
  github: ['github'] as const,
  reports: ['reports'] as const,
  reportList: (filters: ReportFilters) => ['reports', 'list', filters] as const,
  report: (id: string) => ['reports', id] as const,
};

export function useRepositories() {
  return useQuery({ queryKey: queryKeys.repos, queryFn: reposApi.list });
}

export function useGitHubStatus() {
  return useQuery({ queryKey: queryKeys.github, queryFn: githubApi.status });
}

export function useReportList(filters: ReportFilters) {
  return useQuery({
    queryKey: queryKeys.reportList(filters),
    queryFn: () => reportsApi.list(filters),
    placeholderData: (previous) => previous,
  });
}

/** Metriche di uno o più repository nello stesso intervallo, sommate giorno per giorno. */
export function useAggregatedMetrics(repositoryIds: string[], range: Range) {
  return useQueries({
    queries: repositoryIds.map((id) => ({
      queryKey: queryKeys.metrics(id, range),
      queryFn: () => reposApi.metrics(id, range),
    })),
    combine: (results) => {
      const error = results.find((r) => r.error)?.error ?? null;
      const isPending = results.some((r) => r.isPending);
      const points: DailyPoint[] = isPending
        ? []
        : aggregateMetrics(results.map((r) => r.data?.metrics ?? []));
      return { points, isPending, error, refetch: () => results.forEach((r) => void r.refetch()) };
    },
  });
}

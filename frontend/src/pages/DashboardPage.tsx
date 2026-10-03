import { Link, useSearchParams } from 'react-router';
import { Card } from '../components/Card';
import { DateRangeFilter } from '../components/DateRangeFilter';
import { EmptyState } from '../components/EmptyState';
import { ErrorMessage } from '../components/ErrorMessage';
import { KpiTiles } from '../components/KpiTiles';
import { Select } from '../components/Select';
import { Spinner } from '../components/Spinner';
import { SyncStatusBadge } from '../components/SyncStatusBadge';
import { MetricsCharts } from '../components/charts/MetricsCharts';
import { formatDateTime } from '../lib/dates';
import { summarize } from '../lib/metrics';
import { useAggregatedMetrics, useRepositories, useReportList } from '../hooks/queries';
import { useDateRange, useSearchParamsUpdater } from '../hooks/useSearchParam';

export function DashboardPage() {
  const repos = useRepositories();
  const [range, setRange] = useDateRange();
  const [params] = useSearchParams();
  const update = useSearchParamsUpdater();
  const all = repos.data?.repositories ?? [];
  const selected = all.find((r) => r.id === params.get('repo'));
  const ids = selected ? [selected.id] : all.map((r) => r.id);
  const metrics = useAggregatedMetrics(ids, range);
  const recent = useReportList({ limit: 5, offset: 0, repositoryId: selected?.id });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-2xl font-semibold">Overview</h1>
        <div className="flex flex-wrap items-center gap-3">
          <Select
            label="Repository"
            value={selected?.id ?? ''}
            onChange={(value) => update({ repo: value })}
          >
            <option value="">All repositories</option>
            {all.map((repo) => (
              <option key={repo.id} value={repo.id}>
                {repo.name}
              </option>
            ))}
          </Select>
          <DateRangeFilter value={range} onChange={setRange} />
        </div>
      </div>

      {repos.isPending ? (
        <Spinner />
      ) : repos.error ? (
        <ErrorMessage error={repos.error} onRetry={() => void repos.refetch()} />
      ) : all.length === 0 ? (
        <EmptyState title="No repositories tracked yet">
          <Link to="/repos" className="underline">
            Add a repository
          </Link>{' '}
          to start collecting metrics.
        </EmptyState>
      ) : metrics.error ? (
        <ErrorMessage error={metrics.error} onRetry={metrics.refetch} />
      ) : metrics.isPending ? (
        <Spinner label="Loading metrics…" />
      ) : (
        <>
          <KpiTiles summary={summarize(metrics.points)} />
          {metrics.points.length === 0 ? (
            <EmptyState title="No metrics in this date range">
              Try a wider range or run a sync from the repository page.
            </EmptyState>
          ) : (
            <MetricsCharts data={metrics.points} />
          )}
        </>
      )}

      {/* Sotto i grafici solo quando sono pronti: altrimenti il loro arrivo sposta le card (CLS). */}
      {all.length > 0 && !metrics.isPending && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card
            title="Repositories"
            actions={
              <Link to="/repos" className="text-sm underline">
                Manage
              </Link>
            }
          >
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {all.map((repo) => (
                <li key={repo.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                  <Link to={`/repos/${repo.id}`} className="font-medium hover:underline">
                    {repo.name}
                  </Link>
                  <SyncStatusBadge status={repo.syncStatus} />
                </li>
              ))}
            </ul>
          </Card>
          <Card
            title="Latest reports"
            actions={
              <Link to="/reports" className="text-sm underline">
                All reports
              </Link>
            }
          >
            {recent.error ? (
              <ErrorMessage error={recent.error} />
            ) : !recent.data ? (
              <Spinner />
            ) : recent.data.reports.length === 0 ? (
              <p className="text-sm text-slate-500">No reports yet.</p>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {recent.data.reports.map((report) => (
                  <li key={report.id} className="py-2 text-sm">
                    <Link to={`/reports/${report.id}`} className="font-medium hover:underline">
                      {report.repositoryName}
                    </Link>
                    <span className="ml-2 text-slate-500">
                      {formatDateTime(report.generatedAt)}
                    </span>
                    <p className="line-clamp-2 text-slate-600 dark:text-slate-400">
                      {report.summary}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}

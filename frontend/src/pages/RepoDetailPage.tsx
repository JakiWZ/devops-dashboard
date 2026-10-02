import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router';
import { reposApi } from '../api/endpoints';
import { Button } from '../components/Button';
import { DateRangeFilter } from '../components/DateRangeFilter';
import { EmptyState } from '../components/EmptyState';
import { ErrorMessage } from '../components/ErrorMessage';
import { GenerateReportButton } from '../components/GenerateReportButton';
import { KpiTiles } from '../components/KpiTiles';
import { Spinner } from '../components/Spinner';
import { SyncStatusBadge } from '../components/SyncStatusBadge';
import { MetricsCharts } from '../components/charts/MetricsCharts';
import { queryKeys, useAggregatedMetrics } from '../hooks/queries';
import { useDateRange } from '../hooks/useSearchParam';
import { formatDateTime } from '../lib/dates';
import { summarize } from '../lib/metrics';

export function RepoDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [range, setRange] = useDateRange();
  const repo = useQuery({ queryKey: queryKeys.repo(id), queryFn: () => reposApi.get(id) });
  const metrics = useAggregatedMetrics(repo.data ? [id] : [], range);

  const sync = useMutation({
    mutationFn: () => reposApi.sync(id),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: queryKeys.repos }),
  });
  const remove = useMutation({
    mutationFn: () => reposApi.remove(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.repos });
      void queryClient.invalidateQueries({ queryKey: queryKeys.reports });
      void navigate('/repos');
    },
  });

  if (repo.isPending) return <Spinner />;
  if (repo.error) return <ErrorMessage error={repo.error} onRetry={() => void repo.refetch()} />;
  const { repository } = repo.data;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm">
            <Link to="/repos" className="text-slate-600 hover:underline dark:text-slate-400">
              Repositories
            </Link>
          </p>
          <h1 className="text-2xl font-semibold">{repository.name}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-slate-600 dark:text-slate-400">
            <SyncStatusBadge status={repository.syncStatus} />
            <span>
              Last sync:{' '}
              {repository.lastSyncedAt ? formatDateTime(repository.lastSyncedAt) : 'never'}
            </span>
            <a href={repository.url} target="_blank" rel="noreferrer" className="underline">
              Open on GitHub
            </a>
          </div>
          {repository.syncStatus === 'FAILED' && repository.lastSyncError && (
            <p className="mt-2 text-sm text-red-700 dark:text-red-300">
              Last error: {repository.lastSyncError}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-start gap-2">
          <Button disabled={sync.isPending} onClick={() => sync.mutate()}>
            {sync.isPending ? 'Syncing…' : 'Sync now'}
          </Button>
          <GenerateReportButton repositoryId={repository.id} />
          <Button
            variant="danger"
            disabled={remove.isPending}
            onClick={() => {
              if (
                window.confirm(
                  `Stop tracking ${repository.name}? Its metrics and reports will be deleted.`,
                )
              ) {
                remove.mutate();
              }
            }}
          >
            Remove
          </Button>
        </div>
      </div>
      {sync.error && <ErrorMessage error={sync.error} />}
      {remove.error && <ErrorMessage error={remove.error} />}

      <DateRangeFilter value={range} onChange={setRange} />
      {metrics.error ? (
        <ErrorMessage error={metrics.error} onRetry={metrics.refetch} />
      ) : metrics.isPending ? (
        <Spinner label="Loading metrics…" />
      ) : (
        <>
          <KpiTiles summary={summarize(metrics.points)} />
          {metrics.points.length === 0 ? (
            <EmptyState title="No metrics in this date range">
              Run a sync to fetch data from GitHub.
            </EmptyState>
          ) : (
            <MetricsCharts data={metrics.points} />
          )}
        </>
      )}
      <p className="text-sm">
        <Link to={`/reports?repo=${repository.id}`} className="underline">
          Reports for this repository
        </Link>
      </p>
    </div>
  );
}

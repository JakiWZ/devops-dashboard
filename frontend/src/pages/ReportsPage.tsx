import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { EmptyState } from '../components/EmptyState';
import { ErrorMessage } from '../components/ErrorMessage';
import { GenerateReportButton } from '../components/GenerateReportButton';
import { Select } from '../components/Select';
import { Spinner } from '../components/Spinner';
import { useRepositories, useReportList } from '../hooks/queries';
import { useSearchParamsUpdater } from '../hooks/useSearchParam';
import { formatDate, formatDateTime, isIsoDate } from '../lib/dates';

const PAGE_SIZE = 10;
const inputClass =
  'rounded-md border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-900 dark:[color-scheme:dark]';

function GenerateCard({ repositories }: { repositories: Array<{ id: string; name: string }> }) {
  const [repositoryId, setRepositoryId] = useState('');
  const selected = repositoryId || repositories[0]?.id || '';
  return (
    <Card title="New report">
      {repositories.length === 0 ? (
        <p className="text-sm text-slate-600 dark:text-slate-400">
          <Link to="/repos" className="underline">
            Track a repository
          </Link>{' '}
          to generate reports.
        </p>
      ) : (
        <div className="flex flex-wrap items-start gap-3">
          <Select label="Repository" value={selected} onChange={setRepositoryId}>
            {repositories.map((repo) => (
              <option key={repo.id} value={repo.id}>
                {repo.name}
              </option>
            ))}
          </Select>
          <GenerateReportButton repositoryId={selected} />
        </div>
      )}
    </Card>
  );
}

export function ReportsPage() {
  const repos = useRepositories();
  const [params] = useSearchParams();
  const update = useSearchParamsUpdater();
  const repositories = repos.data?.repositories ?? [];
  const repositoryId = params.get('repo') ?? undefined;
  const from = params.get('from');
  const to = params.get('to');
  const page = Math.max(1, Number.parseInt(params.get('page') ?? '1', 10) || 1);
  const list = useReportList({
    repositoryId,
    from: isIsoDate(from) ? from : undefined,
    to: isIsoDate(to) ? to : undefined,
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  });
  const total = list.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Cambiare un filtro riporta sempre alla prima pagina.
  const setFilter = (updates: Record<string, string>) => update({ ...updates, page: null });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Reports</h1>
      <GenerateCard repositories={repositories} />
      <Card
        title="History"
        actions={
          <div className="flex flex-wrap items-center gap-3">
            <Select
              label="Repository"
              value={repositoryId ?? ''}
              onChange={(value) => setFilter({ repo: value })}
            >
              <option value="">All repositories</option>
              {repositories.map((repo) => (
                <option key={repo.id} value={repo.id}>
                  {repo.name}
                </option>
              ))}
            </Select>
            <label className="flex items-center gap-1 text-sm">
              <span className="text-slate-600 dark:text-slate-400">From</span>
              <input
                type="date"
                className={inputClass}
                value={from ?? ''}
                onChange={(e) => setFilter({ from: e.target.value })}
              />
            </label>
            <label className="flex items-center gap-1 text-sm">
              <span className="text-slate-600 dark:text-slate-400">To</span>
              <input
                type="date"
                className={inputClass}
                value={to ?? ''}
                onChange={(e) => setFilter({ to: e.target.value })}
              />
            </label>
          </div>
        }
      >
        {list.error ? (
          <ErrorMessage error={list.error} onRetry={() => void list.refetch()} />
        ) : !list.data ? (
          <Spinner />
        ) : list.data.reports.length === 0 ? (
          <EmptyState title="No reports match these filters" />
        ) : (
          <>
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {list.data.reports.map((report) => (
                <li key={report.id} className="py-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <Link to={`/reports/${report.id}`} className="font-medium hover:underline">
                      {report.repositoryName}
                      {report.periodStart && report.periodEnd && (
                        <span className="font-normal text-slate-600 dark:text-slate-400">
                          {' '}
                          · {formatDate(report.periodStart)} – {formatDate(report.periodEnd)}
                        </span>
                      )}
                    </Link>
                    <span className="text-sm text-slate-500">
                      {formatDateTime(report.generatedAt)}
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm text-slate-600 dark:text-slate-400">
                    {report.summary}
                  </p>
                </li>
              ))}
            </ul>
            <nav aria-label="Pagination" className="mt-4 flex items-center justify-between text-sm">
              <span className="text-slate-600 dark:text-slate-400">
                {total} report{total === 1 ? '' : 's'} · page {page} of {pages}
              </span>
              <div className="flex gap-2">
                <Button
                  disabled={page <= 1}
                  onClick={() => update({ page: page > 2 ? String(page - 1) : null })}
                >
                  Previous
                </Button>
                <Button disabled={page >= pages} onClick={() => update({ page: String(page + 1) })}>
                  Next
                </Button>
              </div>
            </nav>
          </>
        )}
      </Card>
    </div>
  );
}

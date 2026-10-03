import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import { githubApi, reposApi } from '../api/endpoints';
import { syncStatusSchema, type Repository } from '../api/schemas';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { EmptyState } from '../components/EmptyState';
import { ErrorMessage } from '../components/ErrorMessage';
import { Select } from '../components/Select';
import { Spinner } from '../components/Spinner';
import { SyncStatusBadge } from '../components/SyncStatusBadge';
import { queryKeys, useGitHubStatus, useRepositories } from '../hooks/queries';
import { useSearchParamsUpdater } from '../hooks/useSearchParam';
import { formatDateTime } from '../lib/dates';

const inputClass =
  'rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900';

function GitHubConnection() {
  const queryClient = useQueryClient();
  const status = useGitHubStatus();
  const [token, setToken] = useState('');
  const connect = useMutation({
    mutationFn: githubApi.connect,
    onSuccess: (data) => {
      setToken('');
      queryClient.setQueryData(queryKeys.github, data);
      void queryClient.invalidateQueries({ queryKey: queryKeys.available });
    },
  });
  const disconnect = useMutation({
    mutationFn: githubApi.disconnect,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: queryKeys.github }),
  });

  if (status.isPending) return <Spinner />;
  if (status.error) return <ErrorMessage error={status.error} />;
  const { configured, connected, login } = status.data;

  if (!configured) {
    return (
      <p className="text-sm text-slate-600 dark:text-slate-400">
        GitHub integration is not configured on the server (missing <code>SECRETS_ENC_KEY</code>).
        Seeded demo data is still available.
      </p>
    );
  }
  if (connected) {
    return (
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span>
          Connected as <strong>@{login}</strong>
        </span>
        <Button
          variant="danger"
          disabled={disconnect.isPending}
          onClick={() => disconnect.mutate()}
        >
          Disconnect
        </Button>
        {disconnect.error && <ErrorMessage error={disconnect.error} />}
      </div>
    );
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (token.trim()) connect.mutate(token.trim());
  }

  return (
    <form onSubmit={onSubmit} className="space-y-2">
      <p className="text-sm text-slate-600 dark:text-slate-400">
        Paste a fine-grained personal access token with read-only access to Contents, Issues, Pull
        requests and Actions. It is stored encrypted and never shown again.
      </p>
      <div className="flex flex-wrap gap-2">
        <input
          type="password"
          aria-label="GitHub token"
          autoComplete="off"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          className={`${inputClass} min-w-64 flex-1`}
          placeholder="github_pat_…"
        />
        <Button type="submit" variant="primary" disabled={connect.isPending || !token.trim()}>
          {connect.isPending ? 'Verifying…' : 'Connect'}
        </Button>
      </div>
      {connect.error && <ErrorMessage error={connect.error} />}
    </form>
  );
}

function AddRepository() {
  const queryClient = useQueryClient();
  const status = useGitHubStatus();
  const connected = status.data?.connected === true;
  const available = useQuery({
    queryKey: queryKeys.available,
    queryFn: reposApi.available,
    enabled: connected,
  });
  const [fullName, setFullName] = useState('');
  const track = useMutation({
    mutationFn: reposApi.track,
    onSuccess: () => {
      setFullName('');
      void queryClient.invalidateQueries({ queryKey: queryKeys.repos });
    },
  });

  if (!connected) {
    return (
      <p className="text-sm text-slate-600 dark:text-slate-400">
        Connect GitHub to add repositories.
      </p>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (fullName.trim()) track.mutate(fullName.trim());
      }}
      className="space-y-2"
    >
      <div className="flex flex-wrap gap-2">
        <input
          aria-label="Repository (owner/name)"
          list="available-repos"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="owner/name"
          className={`${inputClass} min-w-64 flex-1`}
        />
        <datalist id="available-repos">
          {available.data?.repositories.map((repo) => (
            <option key={repo.githubId} value={repo.fullName} />
          ))}
        </datalist>
        <Button type="submit" variant="primary" disabled={track.isPending || !fullName.trim()}>
          {track.isPending ? 'Adding…' : 'Add repository'}
        </Button>
      </div>
      {available.error && <ErrorMessage error={available.error} />}
      {track.error && <ErrorMessage error={track.error} />}
    </form>
  );
}

function percent(rate: number | null | undefined): string {
  return rate === null || rate === undefined ? '—' : `${Math.round(rate * 100)}%`;
}

function RepositoryTable({ repositories }: { repositories: Repository[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="text-slate-600 dark:text-slate-400">
          <tr>
            <th className="py-2 pr-4 font-medium">Repository</th>
            <th className="py-2 pr-4 font-medium">Status</th>
            <th className="py-2 pr-4 font-medium">Last sync</th>
            <th className="py-2 pr-4 text-right font-medium">Open issues</th>
            <th className="py-2 pr-4 text-right font-medium">Open PRs</th>
            <th className="py-2 text-right font-medium">CI pass rate</th>
          </tr>
        </thead>
        <tbody className="tabular-nums">
          {repositories.map((repo) => (
            <tr key={repo.id} className="border-t border-slate-100 dark:border-slate-800">
              <td className="py-2 pr-4">
                <Link to={`/repos/${repo.id}`} className="font-medium hover:underline">
                  {repo.name}
                </Link>
                {repo.isPrivate && <span className="ml-2 text-xs text-slate-500">private</span>}
              </td>
              <td className="py-2 pr-4">
                <SyncStatusBadge status={repo.syncStatus} />
              </td>
              <td className="py-2 pr-4 text-slate-600 dark:text-slate-400">
                {repo.lastSyncedAt ? formatDateTime(repo.lastSyncedAt) : 'never'}
              </td>
              <td className="py-2 pr-4 text-right">{repo.latestMetrics?.openIssues ?? '—'}</td>
              <td className="py-2 pr-4 text-right">{repo.latestMetrics?.openPRs ?? '—'}</td>
              <td className="py-2 text-right">{percent(repo.latestMetrics?.ciPassRate)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ReposPage() {
  const repos = useRepositories();
  const [params] = useSearchParams();
  const update = useSearchParamsUpdater();
  const parsedStatus = syncStatusSchema.safeParse(params.get('status'));
  const status = parsedStatus.success ? parsedStatus.data : null;
  const visible = (repos.data?.repositories ?? []).filter(
    (repo) => !status || repo.syncStatus === status,
  );

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Repositories</h1>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="GitHub connection">
          <GitHubConnection />
        </Card>
        <Card title="Track a repository">
          <AddRepository />
        </Card>
      </div>
      <Card
        title="Tracked repositories"
        actions={
          <Select
            label="Status"
            value={status ?? ''}
            onChange={(value) => update({ status: value })}
          >
            <option value="">All</option>
            <option value="IDLE">Synced</option>
            <option value="SYNCING">Syncing</option>
            <option value="FAILED">Sync failed</option>
          </Select>
        }
      >
        {repos.isPending ? (
          <Spinner />
        ) : repos.error ? (
          <ErrorMessage error={repos.error} onRetry={() => void repos.refetch()} />
        ) : visible.length === 0 ? (
          <EmptyState
            title={status ? 'No repositories with this status' : 'No repositories tracked yet'}
          />
        ) : (
          <RepositoryTable repositories={visible} />
        )}
      </Card>
    </div>
  );
}

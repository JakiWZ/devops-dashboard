import type { HealthState } from '../hooks/useHealth';

export function HealthStatus({ state }: { state: HealthState }) {
  if (state.kind === 'loading') {
    return <p className="text-slate-500">Checking API status…</p>;
  }
  if (state.kind === 'error') {
    return (
      <p role="alert" className="text-red-600 dark:text-red-400">
        API unreachable: {state.message}
      </p>
    );
  }
  const { data } = state;
  const ok = data.status === 'ok';
  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
      <dt className="text-slate-500">API</dt>
      <dd className={ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600'}>
        {data.status}
      </dd>
      <dt className="text-slate-500">Database</dt>
      <dd>{data.database}</dd>
      <dt className="text-slate-500">Uptime</dt>
      <dd>{Math.round(data.uptime)}s</dd>
    </dl>
  );
}

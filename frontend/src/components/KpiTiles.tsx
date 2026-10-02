import type { MetricsSummary } from '../lib/metrics';

interface Tile {
  label: string;
  value: string;
  hint: string;
}

function format(value: number | null, suffix = ''): string {
  return value === null ? '—' : `${value.toLocaleString('en')}${suffix}`;
}

export function KpiTiles({ summary }: { summary: MetricsSummary }) {
  const tiles: Tile[] = [
    { label: 'Open issues', value: format(summary.openIssues), hint: 'latest day' },
    { label: 'Issues closed', value: format(summary.closedIssues), hint: 'in range' },
    { label: 'Open PRs', value: format(summary.openPRs), hint: 'latest day' },
    { label: 'PRs merged', value: format(summary.mergedPRs), hint: 'in range' },
    {
      label: 'CI pass rate',
      value: format(summary.ciPassRate, '%'),
      hint: 'avg of days with runs',
    },
  ];
  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {tiles.map((tile) => (
        <div
          key={tile.label}
          className="rounded-lg border border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900"
        >
          <dt className="text-sm text-slate-600 dark:text-slate-400">{tile.label}</dt>
          <dd className="mt-1 text-2xl font-semibold tabular-nums">{tile.value}</dd>
          <dd className="text-xs text-slate-500">{tile.hint}</dd>
        </div>
      ))}
    </dl>
  );
}

import type { TooltipContentProps } from 'recharts';
import type { NameType, ValueType } from 'recharts/types/component/DefaultTooltipContent';
import { formatShortDate } from '../../lib/dates';

/** Tooltip con i token di testo del tema: il colore della serie resta sul solo marker. */
export function ChartTooltip({
  active,
  payload,
  label,
  formatValue,
}: TooltipContentProps<ValueType, NameType> & { formatValue: (value: number | null) => string }) {
  if (!active || !payload.length) return null;
  return (
    <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs shadow-md dark:border-slate-700 dark:bg-slate-900">
      <p className="mb-1 font-medium text-slate-900 dark:text-slate-100">
        {typeof label === 'string' ? formatShortDate(label) : null}
      </p>
      {payload.map((entry) => (
        <p
          key={String(entry.dataKey)}
          className="flex items-center gap-2 text-slate-600 dark:text-slate-300"
        >
          <span aria-hidden className="size-2 rounded-full" style={{ background: entry.color }} />
          {entry.name}:{' '}
          <span className="font-medium text-slate-900 tabular-nums dark:text-slate-100">
            {formatValue(typeof entry.value === 'number' ? entry.value : null)}
          </span>
        </p>
      ))}
    </div>
  );
}

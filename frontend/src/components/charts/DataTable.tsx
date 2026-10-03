import { useState } from 'react';
import { formatShortDate } from '../../lib/dates';
import type { DailyPoint } from '../../lib/metrics';
import type { SeriesKey } from './TimeSeriesPanel';

/** Vista tabellare dei dati del grafico: accessibile e utile per leggere i valori esatti. */
export function DataTable({
  data,
  columns,
}: {
  data: DailyPoint[];
  columns: Array<{ key: SeriesKey; label: string; format: (value: number | null) => string }>;
}) {
  // Le righe esistono solo a tabella aperta: tre tabelle da 30-90 righe nascoste rallentavano il
  // primo render della dashboard.
  const [open, setOpen] = useState(false);
  return (
    <details className="mt-3 text-sm" onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary className="cursor-pointer text-slate-600 dark:text-slate-400">
        Show data table
      </summary>
      {open && (
        <div className="mt-2 max-h-64 overflow-auto">
          <table className="w-full text-left tabular-nums">
            <thead className="sticky top-0 bg-white dark:bg-slate-900">
              <tr>
                <th className="py-1 pr-4 font-medium">Date</th>
                {columns.map((c) => (
                  <th key={c.key} className="py-1 pr-4 font-medium">
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((point) => (
                <tr key={point.date} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="py-1 pr-4">{formatShortDate(point.date)}</td>
                  {columns.map((c) => (
                    <td key={c.key} className="py-1 pr-4">
                      {c.format(point[c.key])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </details>
  );
}

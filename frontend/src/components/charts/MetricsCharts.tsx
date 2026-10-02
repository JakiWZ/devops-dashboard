import type { DailyPoint } from '../../lib/metrics';
import { Card } from '../Card';
import { formatCount, formatPercent, SERIES_1, SERIES_2 } from './chart-style';
import { DataTable } from './DataTable';
import { TimeSeriesPanel } from './TimeSeriesPanel';

/**
 * I tre grafici della dashboard. Issue e PR mostrano lo stock (aperte, linea) sopra il flusso
 * giornaliero (chiuse/merged, barre): sono scale diverse, quindi due pannelli con crosshair
 * sincronizzato invece di un grafico a doppio asse.
 */
export function MetricsCharts({ data }: { data: DailyPoint[] }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title="Issues">
        <TimeSeriesPanel
          data={data}
          dataKey="openIssues"
          label="Open issues"
          color={SERIES_1}
          kind="line"
          height={170}
          syncId="issues"
          formatValue={formatCount}
        />
        <TimeSeriesPanel
          data={data}
          dataKey="closedIssues"
          label="Closed per day"
          color={SERIES_2}
          kind="bar"
          height={110}
          syncId="issues"
          formatValue={formatCount}
        />
        <DataTable
          data={data}
          columns={[
            { key: 'openIssues', label: 'Open', format: formatCount },
            { key: 'closedIssues', label: 'Closed', format: formatCount },
          ]}
        />
      </Card>
      <Card title="Pull requests">
        <TimeSeriesPanel
          data={data}
          dataKey="openPRs"
          label="Open PRs"
          color={SERIES_1}
          kind="line"
          height={170}
          syncId="prs"
          formatValue={formatCount}
        />
        <TimeSeriesPanel
          data={data}
          dataKey="mergedPRs"
          label="Merged per day"
          color={SERIES_2}
          kind="bar"
          height={110}
          syncId="prs"
          formatValue={formatCount}
        />
        <DataTable
          data={data}
          columns={[
            { key: 'openPRs', label: 'Open', format: formatCount },
            { key: 'mergedPRs', label: 'Merged', format: formatCount },
          ]}
        />
      </Card>
      <Card title="CI pass rate" className="lg:col-span-2">
        <TimeSeriesPanel
          data={data}
          dataKey="ciPassRate"
          label="Successful runs (days without runs are left blank)"
          color={SERIES_1}
          kind="line"
          height={200}
          formatValue={formatPercent}
          yDomain={[0, 100]}
          yTickFormatter={(value) => `${value}%`}
        />
        <DataTable
          data={data}
          columns={[{ key: 'ciPassRate', label: 'Pass rate', format: formatPercent }]}
        />
      </Card>
    </div>
  );
}

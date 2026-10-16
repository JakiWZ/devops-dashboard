import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatShortDate } from '../../lib/dates';
import type { DailyPoint } from '../../lib/metrics';
import { axisProps, GRID, SURFACE } from './chart-style';
import { ChartTooltip } from './ChartTooltip';
import { useMountInTurn } from './useMountInTurn';

export type SeriesKey = Exclude<keyof DailyPoint, 'date'>;

interface PanelProps {
  data: DailyPoint[];
  dataKey: SeriesKey;
  label: string;
  color: string;
  kind: 'line' | 'bar';
  height: number;
  /** Pannelli con lo stesso syncId condividono il crosshair. */
  syncId?: string;
  formatValue: (value: number | null) => string;
  yDomain?: [number, number];
  yTickFormatter?: (value: number) => string;
}

/** Un pannello = una serie su un solo asse: misure di scala diversa vanno in pannelli separati. */
export function TimeSeriesPanel({
  data,
  dataKey,
  label,
  color,
  kind,
  height,
  syncId,
  formatValue,
  yDomain,
  yTickFormatter,
}: PanelProps) {
  const [placeholder, ready] = useMountInTurn<HTMLDivElement>();
  const common = {
    data,
    syncId,
    margin: { top: 8, right: 8, bottom: 0, left: 0 },
  };
  const axes = (
    <>
      <CartesianGrid stroke={GRID} vertical={false} />
      {/* Scala a bande anche per le linee: i punti cadono al centro delle barre del pannello
          sotto, così il crosshair sincronizzato resta allineato. */}
      <XAxis
        dataKey="date"
        scale="band"
        {...axisProps}
        tickFormatter={formatShortDate}
        // Intervallo fisso (~6 etichette) invece di minTickGap: con minTickGap Recharts misura nel DOM
        // ogni etichetta, e quei layout forzati erano la parte più lenta del primo render su mobile.
        interval={Math.max(0, Math.ceil(data.length / 6) - 1)}
      />
      <YAxis
        {...axisProps}
        width={40}
        allowDecimals={false}
        domain={yDomain}
        tickFormatter={yTickFormatter}
      />
      <Tooltip
        cursor={kind === 'line' ? { stroke: GRID, strokeWidth: 1 } : { fill: GRID, opacity: 0.5 }}
        content={(props) => <ChartTooltip {...props} formatValue={formatValue} />}
      />
    </>
  );

  return (
    <figure>
      <figcaption className="mb-1 flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
        <span
          aria-hidden
          className="h-0.5 w-3 rounded"
          style={{ background: color, height: kind === 'bar' ? 8 : 2 }}
        />
        {label}
      </figcaption>
      {/* Stessa altezza prima e dopo il montaggio del grafico: nessuno spostamento di layout. */}
      {!ready ? (
        <div ref={placeholder} style={{ height }} />
      ) : (
        <ResponsiveContainer width="100%" height={height}>
          {kind === 'line' ? (
            <LineChart {...common}>
              {axes}
              <Line
                type="monotone"
                dataKey={dataKey}
                name={label}
                stroke={color}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, stroke: SURFACE, strokeWidth: 2 }}
                connectNulls={false}
                isAnimationActive={false}
              />
            </LineChart>
          ) : (
            <BarChart {...common} barCategoryGap={2}>
              {axes}
              <Bar
                dataKey={dataKey}
                name={label}
                fill={color}
                radius={[4, 4, 0, 0]}
                isAnimationActive={false}
              />
            </BarChart>
          )}
        </ResponsiveContainer>
      )}
    </figure>
  );
}

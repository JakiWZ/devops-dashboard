// Colori come variabili CSS (definite in index.css per tema chiaro e scuro): i grafici
// cambiano tema senza re-render. Palette validata con lo script della skill dataviz.
export const SERIES_1 = 'var(--chart-series-1)';
export const SERIES_2 = 'var(--chart-series-2)';
export const GRID = 'var(--chart-grid)';
export const AXIS = 'var(--chart-axis)';
export const SURFACE = 'var(--chart-surface)';

export const axisProps = {
  stroke: AXIS,
  tick: { fill: AXIS, fontSize: 12 },
  tickLine: false,
  axisLine: false,
} as const;

export const formatCount = (value: number | null): string =>
  value === null ? 'no data' : value.toLocaleString('en');

export const formatPercent = (value: number | null): string =>
  value === null ? 'no CI runs' : `${value}%`;

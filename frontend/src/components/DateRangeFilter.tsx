import { isIsoDate, lastDays, RANGE_PRESETS, type Range } from '../lib/dates';

const inputClass =
  'rounded-md border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-900 dark:[color-scheme:dark]';

export function DateRangeFilter({
  value,
  onChange,
}: {
  value: Range;
  onChange: (range: Range) => void;
}) {
  return (
    <fieldset className="flex flex-wrap items-center gap-2">
      <legend className="sr-only">Date range</legend>
      <div className="flex overflow-hidden rounded-md border border-slate-300 dark:border-slate-700">
        {RANGE_PRESETS.map((days) => {
          const preset = lastDays(days);
          const active = preset.from === value.from && preset.to === value.to;
          return (
            <button
              key={days}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(preset)}
              className={`px-3 py-1 text-sm ${
                active
                  ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                  : 'hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              {days}d
            </button>
          );
        })}
      </div>
      <label className="flex items-center gap-1 text-sm">
        <span className="text-slate-600 dark:text-slate-400">From</span>
        <input
          type="date"
          className={inputClass}
          value={value.from}
          max={value.to}
          onChange={(e) => {
            if (isIsoDate(e.target.value)) onChange({ ...value, from: e.target.value });
          }}
        />
      </label>
      <label className="flex items-center gap-1 text-sm">
        <span className="text-slate-600 dark:text-slate-400">To</span>
        <input
          type="date"
          className={inputClass}
          value={value.to}
          min={value.from}
          onChange={(e) => {
            if (isIsoDate(e.target.value)) onChange({ ...value, to: e.target.value });
          }}
        />
      </label>
    </fieldset>
  );
}

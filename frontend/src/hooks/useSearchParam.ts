import { useCallback } from 'react';
import { useSearchParams } from 'react-router';
import { parseRange, type Range } from '../lib/dates';

/**
 * I filtri vivono nell'URL: una vista filtrata si può ricaricare, condividere e
 * ritrovare con il tasto indietro.
 */
export function useSearchParamsUpdater(): (
  updates: Record<string, string | null | undefined>,
) => void {
  const [, setParams] = useSearchParams();
  return useCallback(
    (updates) =>
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [key, value] of Object.entries(updates)) {
            if (value) next.set(key, value);
            else next.delete(key);
          }
          return next;
        },
        { replace: true },
      ),
    [setParams],
  );
}

export function useDateRange(): [Range, (range: Range) => void] {
  const [params] = useSearchParams();
  const update = useSearchParamsUpdater();
  const range = parseRange(params.get('from'), params.get('to'));
  const setRange = useCallback((next: Range) => update({ from: next.from, to: next.to }), [update]);
  return [range, setRange];
}

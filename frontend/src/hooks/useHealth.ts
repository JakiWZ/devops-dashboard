import { useEffect, useState } from 'react';
import { fetchHealth, type HealthResponse } from '../api/client';

export type HealthState =
  | { kind: 'loading' }
  | { kind: 'success'; data: HealthResponse }
  | { kind: 'error'; message: string };

export function useHealth(): HealthState {
  const [state, setState] = useState<HealthState>({ kind: 'loading' });

  useEffect(() => {
    const controller = new AbortController();
    fetchHealth(controller.signal)
      .then((data) => setState({ kind: 'success', data }))
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setState({ kind: 'error', message: err instanceof Error ? err.message : 'Unknown error' });
      });
    return () => controller.abort();
  }, []);

  return state;
}

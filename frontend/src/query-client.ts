import { QueryClient } from '@tanstack/react-query';
import { ApiError } from './api/http';

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        // Un 4xx non cambia riprovando: si ritenta solo su errori di rete o 5xx.
        retry: (failureCount, error) =>
          failureCount < 2 && !(error instanceof ApiError && error.status < 500),
      },
    },
  });
}

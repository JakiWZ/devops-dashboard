import { API_URL } from './http';

export interface HealthResponse {
  status: 'ok' | 'degraded';
  uptime: number;
  timestamp: string;
  database: 'up' | 'down';
}

function isHealthResponse(value: unknown): value is HealthResponse {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    (v.status === 'ok' || v.status === 'degraded') &&
    typeof v.uptime === 'number' &&
    typeof v.timestamp === 'string' &&
    (v.database === 'up' || v.database === 'down')
  );
}

export async function fetchHealth(signal?: AbortSignal): Promise<HealthResponse> {
  const res = await fetch(`${API_URL}/api/health`, { signal });
  // 503 è una risposta valida (stato "degraded"): la consideriamo un esito, non un errore di rete.
  const body: unknown = await res.json();
  if (!isHealthResponse(body)) throw new Error(`Unexpected health response (HTTP ${res.status})`);
  return body;
}

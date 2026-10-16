import { z } from 'zod/mini';
import { API_URL } from './http';

const healthResponseSchema = z.object({
  status: z.enum(['ok', 'degraded']),
  uptime: z.number(),
  timestamp: z.string(),
  database: z.enum(['up', 'down']),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;

export async function fetchHealth(signal?: AbortSignal): Promise<HealthResponse> {
  const res = await fetch(`${API_URL}/api/health`, { signal });
  // 503 è una risposta valida (stato "degraded"): la consideriamo un esito, non un errore di rete.
  const body: unknown = await res.json();
  const parsed = healthResponseSchema.safeParse(body);
  if (!parsed.success) throw new Error(`Unexpected health response (HTTP ${res.status})`);
  return parsed.data;
}

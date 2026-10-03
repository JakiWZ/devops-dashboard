import type { z } from 'zod/mini';
import { sessionSchema, type Session } from './schemas';

export const API_URL: string = import.meta.env.VITE_API_URL ?? '';

/** Errore HTTP con il `code` del formato `{ error: { code, message } }` del backend. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

// L'access token vive solo in memoria: mai in localStorage, dove uno script XSS lo leggerebbe.
// Il refresh token è un cookie httpOnly che il browser invia da solo a /api/auth.
let accessToken: string | null = null;
let refreshInFlight: Promise<Session> | null = null;
let onSessionExpired: (() => void) | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

/** Chiamato quando il refresh fallisce durante una richiesta: l'utente va riportato al login. */
export function setSessionExpiredHandler(handler: (() => void) | null): void {
  onSessionExpired = handler;
}

async function toApiError(res: Response): Promise<ApiError> {
  let code = 'HTTP_ERROR';
  let message = `Request failed (HTTP ${res.status})`;
  try {
    const body: unknown = await res.json();
    if (typeof body === 'object' && body !== null && 'error' in body) {
      const error = (body as { error: unknown }).error;
      if (typeof error === 'object' && error !== null) {
        const e = error as Record<string, unknown>;
        if (typeof e.code === 'string') code = e.code;
        if (typeof e.message === 'string') message = e.message;
      }
    }
  } catch {
    // corpo non JSON: resta il messaggio generico
  }
  return new ApiError(res.status, code, message);
}

/**
 * Ruota il refresh token e salva il nuovo access token. Le chiamate concorrenti condividono la
 * stessa richiesta: due refresh paralleli userebbero due volte lo stesso token, e il backend
 * tratta il riuso di un token già ruotato come furto revocando la sessione.
 */
export function refreshSession(): Promise<Session> {
  refreshInFlight ??= (async () => {
    try {
      const res = await fetch(`${API_URL}/api/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) throw await toApiError(res);
      const session = sessionSchema.parse(await res.json());
      accessToken = session.accessToken;
      return session;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
}

async function send(path: string, options: RequestOptions): Promise<Response> {
  const headers: Record<string, string> = {};
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  return fetch(`${API_URL}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    credentials: 'include',
    signal: options.signal,
  });
}

/** Fetch autenticata: su 401 prova un refresh e ripete la richiesta una sola volta. */
export async function request(path: string, options: RequestOptions = {}): Promise<Response> {
  let res = await send(path, options);
  if (res.status === 401 && !path.startsWith('/api/auth/')) {
    try {
      await refreshSession();
    } catch {
      accessToken = null;
      onSessionExpired?.();
      throw await toApiError(res);
    }
    res = await send(path, options);
  }
  if (!res.ok) throw await toApiError(res);
  return res;
}

export async function requestJson<T>(
  path: string,
  schema: z.ZodMiniType<T>,
  options: RequestOptions = {},
): Promise<T> {
  const res = await request(path, options);
  return schema.parse(await res.json());
}

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return 'Unexpected error';
}

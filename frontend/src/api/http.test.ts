import {
  ApiError,
  refreshSession,
  request,
  setAccessToken,
  setSessionExpiredHandler,
} from './http';

const session = {
  user: { id: 'u1', email: 'a@example.com', role: 'USER', createdAt: '2026-10-01T00:00:00.000Z' },
  accessToken: 'new-token',
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function authHeader(call: unknown[]): string | undefined {
  const init = call[1] as RequestInit | undefined;
  return (init?.headers as Record<string, string> | undefined)?.Authorization;
}

describe('request', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    setAccessToken('old-token');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    setSessionExpiredHandler(null);
  });

  it('refreshes an expired access token and retries the request once', async () => {
    fetchMock
      .mockResolvedValueOnce(json(401, { error: { code: 'UNAUTHORIZED', message: 'expired' } }))
      .mockResolvedValueOnce(json(200, session))
      .mockResolvedValueOnce(json(200, { ok: true }));

    const res = await request('/api/repos');

    expect(res.status).toBe(200);
    expect(fetchMock.mock.calls[1]?.[0]).toBe('/api/auth/refresh');
    expect(authHeader(fetchMock.mock.calls[0] ?? [])).toBe('Bearer old-token');
    expect(authHeader(fetchMock.mock.calls[2] ?? [])).toBe('Bearer new-token');
  });

  it('ends the session when the refresh token is no longer valid', async () => {
    const expired = vi.fn();
    setSessionExpiredHandler(expired);
    fetchMock
      .mockResolvedValueOnce(json(401, { error: { code: 'UNAUTHORIZED', message: 'expired' } }))
      .mockResolvedValueOnce(json(401, { error: { code: 'INVALID_REFRESH_TOKEN', message: 'x' } }));

    await expect(request('/api/repos')).rejects.toBeInstanceOf(ApiError);
    expect(expired).toHaveBeenCalledOnce();
  });

  it('exposes the backend error code and message', async () => {
    fetchMock.mockResolvedValueOnce(
      json(409, { error: { code: 'SYNC_IN_PROGRESS', message: 'Sync already running' } }),
    );
    await expect(request('/api/repos/1/sync', { method: 'POST' })).rejects.toMatchObject({
      status: 409,
      code: 'SYNC_IN_PROGRESS',
      message: 'Sync already running',
    });
  });

  it('shares one refresh between concurrent callers', async () => {
    // Due refresh in parallele riuserebbero lo stesso token ruotato: il backend revocherebbe la sessione.
    fetchMock.mockResolvedValue(json(200, session));
    await Promise.all([refreshSession(), refreshSession()]);
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});

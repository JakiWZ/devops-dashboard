import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { createQueryClient } from '../query-client';
import { routes } from '../routes';
import { AuthProvider } from './AuthProvider';

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(
    <QueryClientProvider client={createQueryClient()}>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </QueryClientProvider>,
  );
  return router;
}

describe('authentication flow', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({ matches: false })),
    );
  });

  afterEach(() => vi.unstubAllGlobals());

  it('sends anonymous users to the login page, then back to the page they asked for', async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith('/api/auth/refresh')) {
        return json(401, { error: { code: 'INVALID_REFRESH_TOKEN', message: 'no session' } });
      }
      if (url.endsWith('/api/auth/login')) {
        return json(200, {
          user: { id: 'u1', email: 'demo@example.com', role: 'ADMIN', createdAt: '2026-10-01' },
          accessToken: 'token',
        });
      }
      if (url.startsWith('/api/reports')) return json(200, { reports: [], total: 0 });
      if (url.endsWith('/api/repos')) return json(200, { repositories: [] });
      return json(200, { status: 'ok', uptime: 1, timestamp: '', database: 'up' });
    });

    const router = renderAt('/reports');
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    expect(router.state.location.search).toBe('?from=%2Freports');

    await userEvent.type(screen.getByLabelText('Email'), 'demo@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'demo-password');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('heading', { name: 'Reports', level: 1 })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/reports');
  });

  it('does not follow redirects to other sites after login', async () => {
    fetchMock.mockImplementation(async (input) =>
      String(input).endsWith('/api/auth/refresh')
        ? json(200, {
            user: { id: 'u1', email: 'demo@example.com', role: 'USER', createdAt: '2026-10-01' },
            accessToken: 'token',
          })
        : json(200, { repositories: [], reports: [], total: 0 }),
    );
    const router = renderAt('/login?from=//evil.example.com');
    expect(await screen.findByRole('heading', { name: 'Overview' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/');
  });
});

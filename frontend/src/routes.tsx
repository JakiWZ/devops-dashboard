import type { RouteObject } from 'react-router';
import { RequireAuth } from './auth/RequireAuth';
import { Layout } from './components/Layout';
import { AuthPage } from './pages/AuthPage';
import { NotFoundPage } from './pages/NotFoundPage';

// Pagine caricate on demand: Recharts e il renderer Markdown non pesano sulla pagina di login.
export const routes: RouteObject[] = [
  { path: '/login', element: <AuthPage mode="login" /> },
  { path: '/register', element: <AuthPage mode="register" /> },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <Layout />,
        children: [
          {
            index: true,
            lazy: async () => ({
              Component: (await import('./pages/DashboardPage')).DashboardPage,
            }),
          },
          {
            path: 'repos',
            lazy: async () => ({ Component: (await import('./pages/ReposPage')).ReposPage }),
          },
          {
            path: 'repos/:id',
            lazy: async () => ({
              Component: (await import('./pages/RepoDetailPage')).RepoDetailPage,
            }),
          },
          {
            path: 'reports',
            lazy: async () => ({ Component: (await import('./pages/ReportsPage')).ReportsPage }),
          },
          {
            path: 'reports/:id',
            lazy: async () => ({
              Component: (await import('./pages/ReportDetailPage')).ReportDetailPage,
            }),
          },
          {
            path: 'settings/ai',
            lazy: async () => ({
              Component: (await import('./pages/AiSettingsPage')).AiSettingsPage,
            }),
          },
          {
            path: 'settings/notifications',
            lazy: async () => ({
              Component: (await import('./pages/NotificationsPage')).NotificationsPage,
            }),
          },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
];

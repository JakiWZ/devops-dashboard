import { NavLink, Outlet } from 'react-router';
import { useAuth } from '../auth/auth-context';
import { useHealth } from '../hooks/useHealth';
import { ThemeToggle } from './ThemeToggle';

const links = [
  { to: '/', label: 'Overview', end: true },
  { to: '/repos', label: 'Repositories', end: false },
  { to: '/reports', label: 'Reports', end: false },
  { to: '/settings/ai', label: 'AI settings', end: false },
];

function ApiStatus() {
  const health = useHealth();
  if (health.kind === 'loading') return null;
  const ok = health.kind === 'success' && health.data.status === 'ok';
  return (
    <span className="flex items-center gap-1.5">
      <span aria-hidden>{ok ? '●' : '▲'}</span>
      API {ok ? 'online' : health.kind === 'error' ? 'unreachable' : 'degraded'}
    </span>
  );
}

export function Layout() {
  const { state, logout } = useAuth();
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <span className="font-semibold">DevOps Dashboard</span>
          <nav aria-label="Main" className="flex gap-1">
            {links.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.end}
                className={({ isActive }) =>
                  `rounded-md px-3 py-1.5 text-sm ${
                    isActive
                      ? 'bg-slate-100 font-medium dark:bg-slate-800'
                      : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
                  }`
                }
              >
                {link.label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm">
            <span className="hidden text-slate-600 sm:inline dark:text-slate-400">
              {state.user?.email}
            </span>
            <ThemeToggle />
            <button
              type="button"
              onClick={() => void logout()}
              className="rounded-md px-3 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              Log out
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
        <Outlet />
      </main>
      <footer className="mx-auto w-full max-w-6xl px-4 py-4 text-xs text-slate-500">
        <ApiStatus />
      </footer>
    </div>
  );
}

import { Navigate, Outlet, useLocation } from 'react-router';
import { Spinner } from '../components/Spinner';
import { useAuth } from './auth-context';

/** Rotte protette: senza sessione si va al login, ricordando la pagina richiesta. */
export function RequireAuth() {
  const { state } = useAuth();
  const location = useLocation();
  if (state.status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner label="Restoring session…" />
      </div>
    );
  }
  if (state.status === 'anonymous') {
    const from = `${location.pathname}${location.search}`;
    return <Navigate to={`/login?from=${encodeURIComponent(from)}`} replace />;
  }
  return <Outlet />;
}

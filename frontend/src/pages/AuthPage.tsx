import { useState, type FormEvent } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router';
import { errorMessage } from '../api/http';
import { useAuth } from '../auth/auth-context';
import { Button } from '../components/Button';
import { ThemeToggle } from '../components/ThemeToggle';

const inputClass =
  'mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900';

/** Solo percorsi interni: un `?from=https://...` non deve diventare un open redirect. */
function safeRedirect(from: string | null): string {
  return from?.startsWith('/') && !from.startsWith('//') ? from : '/';
}

export function AuthPage({ mode }: { mode: 'login' | 'register' }) {
  const { state, login, register } = useAuth();
  const [params] = useSearchParams();
  const [error, setError] = useState<unknown>(null);
  const [submitting, setSubmitting] = useState(false);
  const isLogin = mode === 'login';

  if (state.status === 'authenticated') {
    return <Navigate to={safeRedirect(params.get('from'))} replace />;
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const credentials = {
      email: String(form.get('email') ?? ''),
      password: String(form.get('password') ?? ''),
    };
    setSubmitting(true);
    setError(null);
    try {
      await (isLogin ? login(credentials) : register(credentials));
    } catch (err) {
      setError(err);
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-sm rounded-lg border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <h1 className="text-xl font-semibold">{isLogin ? 'Sign in' : 'Create an account'}</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">DevOps Dashboard</p>
        <form onSubmit={(e) => void onSubmit(e)} className="mt-6 space-y-4">
          <label className="block text-sm">
            Email
            <input name="email" type="email" autoComplete="email" required className={inputClass} />
          </label>
          <label className="block text-sm">
            Password
            <input
              name="password"
              type="password"
              autoComplete={isLogin ? 'current-password' : 'new-password'}
              minLength={isLogin ? undefined : 8}
              required
              className={inputClass}
            />
          </label>
          {error !== null && (
            <p role="alert" className="text-sm text-red-700 dark:text-red-300">
              {errorMessage(error)}
            </p>
          )}
          <Button type="submit" variant="primary" disabled={submitting} className="w-full py-2">
            {submitting ? 'Please wait…' : isLogin ? 'Sign in' : 'Create account'}
          </Button>
        </form>
        <p className="mt-4 text-center text-sm text-slate-600 dark:text-slate-400">
          {isLogin ? 'No account yet? ' : 'Already registered? '}
          <Link
            to={isLogin ? '/register' : '/login'}
            className="font-medium text-slate-900 underline dark:text-slate-100"
          >
            {isLogin ? 'Create one' : 'Sign in'}
          </Link>
        </p>
      </div>
    </main>
  );
}

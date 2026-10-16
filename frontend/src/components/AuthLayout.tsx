import type { ReactNode } from 'react';
import { ThemeToggle } from './ThemeToggle';

export const authInputClass =
  'mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900';

export const authLinkClass = 'font-medium text-slate-900 underline dark:text-slate-100';

/** Scheletro comune delle pagine fuori sessione: login, registrazione e reset password. */
export function AuthLayout({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-sm rounded-lg border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <h1 className="text-xl font-semibold">{title}</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">DevOps Dashboard</p>
        {children}
      </div>
    </main>
  );
}

import type { ReactNode } from 'react';

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 px-6 py-10 text-center dark:border-slate-700">
      <p className="font-medium">{title}</p>
      {children && (
        <div className="mt-2 text-sm text-slate-500 dark:text-slate-400">{children}</div>
      )}
    </div>
  );
}

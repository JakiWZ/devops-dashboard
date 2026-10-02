import { HealthStatus } from '../components/HealthStatus';
import { ThemeToggle } from '../components/ThemeToggle';
import { useHealth } from '../hooks/useHealth';

export function HomePage() {
  const health = useHealth();
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-8 px-4 py-12">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">DevOps Dashboard</h1>
        <ThemeToggle />
      </header>
      <section className="rounded-lg border border-slate-200 p-6 dark:border-slate-800">
        <h2 className="mb-4 text-lg font-medium">System status</h2>
        <HealthStatus state={health} />
      </section>
    </main>
  );
}

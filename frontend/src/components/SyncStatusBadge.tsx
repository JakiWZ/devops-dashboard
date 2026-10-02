import type { SyncStatus } from '../api/schemas';

// Lo stato non è affidato al solo colore: ogni badge ha icona ed etichetta.
const styles: Record<SyncStatus, { label: string; icon: string; className: string }> = {
  IDLE: {
    label: 'Synced',
    icon: '✓',
    className: 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200',
  },
  SYNCING: {
    label: 'Syncing',
    icon: '↻',
    className: 'bg-sky-50 text-sky-800 dark:bg-sky-950 dark:text-sky-200',
  },
  FAILED: {
    label: 'Sync failed',
    icon: '!',
    className: 'bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-200',
  },
};

export function SyncStatusBadge({ status }: { status: SyncStatus }) {
  const style = styles[status];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${style.className}`}
    >
      <span aria-hidden>{style.icon}</span>
      {style.label}
    </span>
  );
}

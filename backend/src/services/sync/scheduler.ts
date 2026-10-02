import type { PrismaClient } from '@prisma/client';
import { logger } from '../../lib/logger.js';
import type { RepoSyncService } from './sync.service.js';

/**
 * Sync periodico in-process: a ogni tick sincronizza, uno alla volta, i repository
 * mai sincronizzati o più vecchi dell'intervallo, solo per utenti con token GitHub.
 */
export function startSyncScheduler(
  db: PrismaClient,
  syncService: RepoSyncService,
  intervalMinutes: number,
): () => void {
  if (intervalMinutes <= 0) {
    logger.info('Automatic repository sync disabled');
    return () => undefined;
  }

  const intervalMs = intervalMinutes * 60 * 1000;
  let running = false;

  async function tick(): Promise<void> {
    if (running) return;
    running = true;
    try {
      const dueBefore = new Date(Date.now() - intervalMs);
      const repos = await db.repository.findMany({
        where: {
          user: { githubTokenEnc: { not: null } },
          syncStatus: { not: 'SYNCING' },
          OR: [{ lastSyncedAt: null }, { lastSyncedAt: { lt: dueBefore } }],
        },
        select: { id: true },
        orderBy: { lastSyncedAt: { sort: 'asc', nulls: 'first' } },
      });
      for (const { id } of repos) {
        // Un repository che fallisce non blocca gli altri: l'errore resta in lastSyncError.
        await syncService.sync(id).catch((err: unknown) => {
          logger.warn({ err, repositoryId: id }, 'Scheduled sync failed');
        });
      }
    } catch (err) {
      logger.error({ err }, 'Sync scheduler tick failed');
    } finally {
      running = false;
    }
  }

  // Controllo ogni 5 minuti (o meno, se l'intervallo è più corto) chi è in scadenza.
  const timer = setInterval(() => void tick(), Math.min(intervalMs, 5 * 60 * 1000));
  timer.unref();
  void tick();
  logger.info({ intervalMinutes }, 'Automatic repository sync enabled');
  return () => clearInterval(timer);
}

import type { PrismaClient, Repository } from '@prisma/client';
import { HttpError } from '../../lib/http-error.js';
import { logger } from '../../lib/logger.js';
import type { GitHubClient } from '../github/github.types.js';
import { addDays, computeDailyMetrics, daysBetween, startOfUtcDay } from './metrics.js';

/** Giorni ricostruiti al primo sync (e tetto massimo per i sync successivi). */
export const BACKFILL_DAYS = 30;
/** Oltre questa durata un lock SYNCING è considerato orfano (processo morto a metà sync). */
const STALE_LOCK_MS = 15 * 60 * 1000;

export type ClientForUser = (userId: string) => Promise<GitHubClient>;

export interface SyncResult {
  repository: Repository;
  daysUpdated: number;
}

export class RepoSyncService {
  constructor(
    private readonly db: PrismaClient,
    private readonly clientFor: ClientForUser,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async sync(repositoryId: string): Promise<SyncResult> {
    const now = this.now();
    const repo = await this.acquireLock(repositoryId, now);

    try {
      const client = await this.clientFor(repo.userId);
      const today = startOfUtcDay(now);
      const earliest = addDays(today, -(BACKFILL_DAYS - 1));
      // Sync incrementale: ricalcoliamo dal giorno dell'ultimo sync (che poteva essere parziale).
      const from =
        repo.lastSyncedAt && startOfUtcDay(repo.lastSyncedAt) > earliest
          ? startOfUtcDay(repo.lastSyncedAt)
          : earliest;

      const [open, closed, runs] = await Promise.all([
        client.listOpenIssues(repo.name),
        client.listClosedIssuesSince(repo.name, from),
        client.listWorkflowRunsSince(repo.name, from),
      ]);
      const metrics = computeDailyMetrics([...open, ...closed], runs, daysBetween(from, today));

      const repository = await this.db.$transaction(async (tx) => {
        for (const { date, ...values } of metrics) {
          await tx.metrics.upsert({
            where: { repositoryId_date: { repositoryId: repo.id, date } },
            update: values,
            create: { ...values, date, repositoryId: repo.id },
          });
        }
        return tx.repository.update({
          where: { id: repo.id },
          data: {
            syncStatus: 'IDLE',
            syncStartedAt: null,
            lastSyncError: null,
            lastSyncedAt: now,
          },
        });
      });

      logger.info({ repositoryId, days: metrics.length }, 'Repository synced');
      return { repository, daysUpdated: metrics.length };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      await this.db.repository.update({
        where: { id: repo.id },
        data: { syncStatus: 'FAILED', syncStartedAt: null, lastSyncError: message.slice(0, 500) },
      });
      throw err;
    }
  }

  /** Lock ottimistico sul repository: due sync concorrenti non scrivono le stesse metriche. */
  private async acquireLock(repositoryId: string, now: Date): Promise<Repository> {
    const staleBefore = new Date(now.getTime() - STALE_LOCK_MS);
    const { count } = await this.db.repository.updateMany({
      where: {
        id: repositoryId,
        OR: [{ syncStatus: { not: 'SYNCING' } }, { syncStartedAt: { lt: staleBefore } }],
      },
      data: { syncStatus: 'SYNCING', syncStartedAt: now },
    });
    if (count === 0) {
      const exists = await this.db.repository.count({ where: { id: repositoryId } });
      if (!exists) throw new HttpError(404, 'Repository not found', 'NOT_FOUND');
      throw new HttpError(409, 'A sync is already running for this repository', 'SYNC_IN_PROGRESS');
    }
    return this.db.repository.findUniqueOrThrow({ where: { id: repositoryId } });
  }
}

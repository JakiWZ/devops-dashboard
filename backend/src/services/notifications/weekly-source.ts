import type { Metrics, PrismaClient } from '@prisma/client';
import { HttpError } from '../../lib/http-error.js';
import { logger } from '../../lib/logger.js';
import type { ReportService } from '../reports/report.service.js';
import type { WeeklyRepoSummary, WeeklyReportSource } from './notification.service.js';

function metricsLine(m: Metrics | null): string {
  if (!m) return 'No metrics yet: sync the repository from the dashboard.';
  const ci = m.ciPassRate === null ? 'n/a' : `${Math.round(m.ciPassRate * 100)}%`;
  return `Open issues ${m.openIssues} · open PRs ${m.openPRs} · CI pass rate ${ci}`;
}

/**
 * Report settimanale: per ogni repository genera un report AI (chiave dell'utente o default del
 * server). Se l'AI non è disponibile o fallisce, il messaggio riporta le ultime metriche.
 */
export class ReportWeeklySource implements WeeklyReportSource {
  constructor(
    private readonly db: PrismaClient,
    private readonly reports: ReportService,
    private readonly appUrl: string,
  ) {}

  async summariesFor(userId: string): Promise<WeeklyRepoSummary[]> {
    const repos = await this.db.repository.findMany({
      where: { userId },
      orderBy: { name: 'asc' },
      include: { metrics: { orderBy: { date: 'desc' }, take: 1 } },
    });
    let aiAvailable = true;
    const summaries: WeeklyRepoSummary[] = [];
    for (const repo of repos) {
      const metrics = metricsLine(repo.metrics[0] ?? null);
      if (aiAvailable) {
        try {
          const report = await this.reports.generate(userId, repo.id);
          summaries.push({
            name: repo.name,
            summary: `${report.summary}\n${metrics}`,
            reportUrl: `${this.appUrl}/reports/${report.id}`,
          });
          continue;
        } catch (err) {
          // Senza AI configurata è inutile riprovare sugli altri repository.
          if (err instanceof HttpError && err.code === 'AI_NOT_CONFIGURED') aiAvailable = false;
          else logger.warn({ err, repositoryId: repo.id }, 'Weekly report generation failed');
        }
      }
      summaries.push({ name: repo.name, summary: metrics, reportUrl: null });
    }
    return summaries;
  }
}

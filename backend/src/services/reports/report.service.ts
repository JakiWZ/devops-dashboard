import type { PrismaClient, Report } from '@prisma/client';
import { HttpError } from '../../lib/http-error.js';
import { logger } from '../../lib/logger.js';
import type { GitHubAccountService } from '../github/github-account.service.js';
import type { GitHubIssue } from '../github/github.types.js';
import { addDays, startOfUtcDay } from '../sync/metrics.js';
import type { ReportGenerator } from './report-generator.js';
import { buildReportInput } from './report-input.js';
import { renderReportMarkdown } from './report-render.js';

export type ReportWithRepo = Report & { repository: { id: string; name: string } };

const withRepo = { repository: { select: { id: true, name: true } } } as const;

export class ReportService {
  constructor(
    private readonly db: PrismaClient,
    private readonly github: GitHubAccountService,
    private readonly generator: ReportGenerator | null,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async generate(userId: string, repositoryId: string): Promise<ReportWithRepo> {
    if (!this.generator) {
      throw new HttpError(503, 'AI report generation is not configured', 'AI_NOT_CONFIGURED');
    }
    const repo = await this.db.repository.findFirst({ where: { id: repositoryId, userId } });
    if (!repo) throw new HttpError(404, 'Repository not found', 'NOT_FOUND');

    const now = this.now();
    const metrics = await this.db.metrics.findMany({
      where: { repositoryId: repo.id, date: { gte: addDays(startOfUtcDay(now), -13) } },
    });
    const input = buildReportInput(
      repo.name,
      metrics,
      await this.openItems(userId, repo.name),
      now,
    );
    const { model, analysis } = await this.generator.generate(input);

    return this.db.report.create({
      data: {
        repositoryId: repo.id,
        summary: analysis.summary,
        content: renderReportMarkdown(input, analysis),
        model,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
      },
      include: withRepo,
    });
  }

  async list(
    userId: string,
    filter: { repositoryId?: string; limit: number },
  ): Promise<ReportWithRepo[]> {
    return this.db.report.findMany({
      where: {
        repository: { userId },
        ...(filter.repositoryId && { repositoryId: filter.repositoryId }),
      },
      orderBy: { generatedAt: 'desc' },
      take: filter.limit,
      include: withRepo,
    });
  }

  /** Un report di un altro utente risponde 404: non ne riveliamo l'esistenza. */
  async get(userId: string, id: string): Promise<ReportWithRepo> {
    const report = await this.db.report.findFirst({
      where: { id, repository: { userId } },
      include: withRepo,
    });
    if (!report) throw new HttpError(404, 'Report not found', 'NOT_FOUND');
    return report;
  }

  async remove(userId: string, id: string): Promise<void> {
    const { count } = await this.db.report.deleteMany({ where: { id, repository: { userId } } });
    if (count === 0) throw new HttpError(404, 'Report not found', 'NOT_FOUND');
  }

  /**
   * Issue e PR aperte da GitHub per individuare il tech debt. Senza GitHub collegato il
   * report si basa solo sulle metriche: meglio un report parziale che nessun report.
   */
  private async openItems(userId: string, fullName: string): Promise<GitHubIssue[] | null> {
    try {
      const client = await this.github.clientFor(userId);
      return await client.listOpenIssues(fullName);
    } catch (err) {
      // Token assente o non valido, rate limit, repo sparito: degradiamo invece di fallire.
      if (err instanceof HttpError && err.code.startsWith('GITHUB_')) {
        logger.info({ code: err.code }, 'Report generated without live GitHub data');
        return null;
      }
      throw err;
    }
  }
}

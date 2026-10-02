import type { Prisma, PrismaClient, Report } from '@prisma/client';
import { HttpError } from '../../lib/http-error.js';
import { logger } from '../../lib/logger.js';
import type { GitHubAccountService } from '../github/github-account.service.js';
import type { RepoService } from '../repos.service.js';
import { addDays } from '../sync/metrics.js';
import { renderReportMarkdown } from './markdown.js';
import type { ReportGenerator } from './report-generator.js';
import {
  buildReportInput,
  referenceableUrls,
  REPORT_PERIOD_DAYS,
  type LiveGitHubData,
} from './report-input.js';

export interface ReportListFilters {
  repositoryId?: string;
  from?: Date;
  to?: Date;
  limit: number;
  offset: number;
}

export type ReportSummary = Pick<
  Report,
  'id' | 'repositoryId' | 'summary' | 'generatedAt' | 'model' | 'periodStart' | 'periodEnd'
> & { repositoryName: string };

export type ReportWithRepo = Report & { repositoryName: string };

export class ReportService {
  /** Un solo report alla volta per repository: la generazione dura decine di secondi e costa. */
  private readonly inFlight = new Set<string>();

  constructor(
    private readonly db: PrismaClient,
    private readonly repos: RepoService,
    private readonly github: GitHubAccountService,
    private readonly generator: ReportGenerator | null,
  ) {}

  async generate(userId: string, repositoryId: string): Promise<ReportWithRepo> {
    if (!this.generator) {
      throw new HttpError(503, 'AI report generation is not configured', 'AI_NOT_CONFIGURED');
    }
    const repo = await this.repos.get(userId, repositoryId);
    if (this.inFlight.has(repo.id)) {
      throw new HttpError(
        409,
        'A report for this repository is already being generated',
        'REPORT_IN_PROGRESS',
      );
    }
    this.inFlight.add(repo.id);
    try {
      const now = new Date();
      const [metrics, live] = await Promise.all([
        this.db.metrics.findMany({
          where: { repositoryId: repo.id, date: { gte: addDays(now, -15) } },
          orderBy: { date: 'asc' },
        }),
        this.fetchLive(userId, repo.name, addDays(now, -REPORT_PERIOD_DAYS)),
      ]);
      const input = buildReportInput({ repository: repo, metrics, live, now });
      const result = await this.generator.generate(input);
      const content = renderReportMarkdown(input, result.draft, referenceableUrls(input));

      const report = await this.db.report.create({
        data: {
          repositoryId: repo.id,
          summary: result.draft.summary,
          content,
          data: result.draft as unknown as Prisma.InputJsonValue,
          model: result.model,
          periodStart: new Date(`${input.period.from}T00:00:00.000Z`),
          periodEnd: now,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
        },
      });
      logger.info(
        { reportId: report.id, model: result.model, outputTokens: result.outputTokens },
        'Report generated',
      );
      return { ...report, repositoryName: repo.name };
    } finally {
      this.inFlight.delete(repo.id);
    }
  }

  async list(
    userId: string,
    filters: ReportListFilters,
  ): Promise<{ reports: ReportSummary[]; total: number }> {
    const where: Prisma.ReportWhereInput = {
      repository: { userId },
      ...(filters.repositoryId && { repositoryId: filters.repositoryId }),
      ...((filters.from || filters.to) && {
        generatedAt: {
          ...(filters.from && { gte: filters.from }),
          ...(filters.to && { lt: addDays(filters.to, 1) }),
        },
      }),
    };
    const [rows, total] = await Promise.all([
      this.db.report.findMany({
        where,
        orderBy: { generatedAt: 'desc' },
        take: filters.limit,
        skip: filters.offset,
        select: {
          id: true,
          repositoryId: true,
          summary: true,
          generatedAt: true,
          model: true,
          periodStart: true,
          periodEnd: true,
          repository: { select: { name: true } },
        },
      }),
      this.db.report.count({ where }),
    ]);
    return {
      reports: rows.map(({ repository, ...rest }) => ({
        ...rest,
        repositoryName: repository.name,
      })),
      total,
    };
  }

  /** Un report di un altro utente risponde 404, come i repository. */
  async get(userId: string, id: string): Promise<ReportWithRepo> {
    const report = await this.db.report.findFirst({
      where: { id, repository: { userId } },
      include: { repository: { select: { name: true } } },
    });
    if (!report) throw new HttpError(404, 'Report not found', 'NOT_FOUND');
    const { repository, ...rest } = report;
    return { ...rest, repositoryName: repository.name };
  }

  async remove(userId: string, id: string): Promise<void> {
    const { count } = await this.db.report.deleteMany({ where: { id, repository: { userId } } });
    if (count === 0) throw new HttpError(404, 'Report not found', 'NOT_FOUND');
  }

  /**
   * Dati live da GitHub se l'utente è collegato. Senza collegamento (o senza cifratura
   * configurata) il report si basa sulle sole metriche già sincronizzate.
   */
  private async fetchLive(
    userId: string,
    fullName: string,
    since: Date,
  ): Promise<LiveGitHubData | null> {
    let client;
    try {
      client = await this.github.clientFor(userId);
    } catch (err) {
      if (
        err instanceof HttpError &&
        (err.code === 'GITHUB_NOT_CONNECTED' || err.code === 'GITHUB_NOT_CONFIGURED')
      ) {
        return null;
      }
      throw err;
    }
    const [open, closed, runs] = await Promise.all([
      client.listOpenIssues(fullName),
      client.listClosedIssuesSince(fullName, since),
      client.listWorkflowRunsSince(fullName, since),
    ]);
    return { open, closed, runs };
  }
}

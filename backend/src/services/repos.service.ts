import { Prisma, type Metrics, type PrismaClient, type Repository } from '@prisma/client';
import { HttpError } from '../lib/http-error.js';
import type { GitHubAccountService } from './github/github-account.service.js';
import type { GitHubRepoInfo } from './github/github.types.js';
import { addDays, startOfUtcDay } from './sync/metrics.js';

export type RepositoryWithLatest = Repository & { latestMetrics: Metrics | null };

export class RepoService {
  constructor(
    private readonly db: PrismaClient,
    private readonly github: GitHubAccountService,
  ) {}

  /** Repository GitHub dell'utente non ancora tracciati. */
  async listAvailable(userId: string): Promise<GitHubRepoInfo[]> {
    const client = await this.github.clientFor(userId);
    const [remote, tracked] = await Promise.all([
      client.listUserRepos(),
      this.db.repository.findMany({ where: { userId }, select: { githubId: true } }),
    ]);
    const trackedIds = new Set(tracked.map((repo) => repo.githubId));
    return remote.filter((repo) => !trackedIds.has(repo.githubId));
  }

  async track(userId: string, fullName: string): Promise<Repository> {
    const client = await this.github.clientFor(userId);
    const info = await client.getRepo(fullName);
    try {
      return await this.db.repository.create({
        data: {
          userId,
          githubId: info.githubId,
          name: info.fullName,
          url: info.url,
          defaultBranch: info.defaultBranch,
          isPrivate: info.isPrivate,
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new HttpError(409, 'Repository already tracked', 'REPO_ALREADY_TRACKED');
      }
      throw err;
    }
  }

  async list(userId: string): Promise<RepositoryWithLatest[]> {
    const repos = await this.db.repository.findMany({
      where: { userId },
      orderBy: { name: 'asc' },
      include: { metrics: { orderBy: { date: 'desc' }, take: 1 } },
    });
    return repos.map(({ metrics, ...repo }) => ({ ...repo, latestMetrics: metrics[0] ?? null }));
  }

  /** Un repository di un altro utente risponde 404, non 403: non ne riveliamo l'esistenza. */
  async get(userId: string, id: string): Promise<RepositoryWithLatest> {
    const repo = await this.db.repository.findFirst({
      where: { id, userId },
      include: { metrics: { orderBy: { date: 'desc' }, take: 1 } },
    });
    if (!repo) throw new HttpError(404, 'Repository not found', 'NOT_FOUND');
    const { metrics, ...rest } = repo;
    return { ...rest, latestMetrics: metrics[0] ?? null };
  }

  async remove(userId: string, id: string): Promise<void> {
    const { count } = await this.db.repository.deleteMany({ where: { id, userId } });
    if (count === 0) throw new HttpError(404, 'Repository not found', 'NOT_FOUND');
  }

  async metrics(
    userId: string,
    id: string,
    range: { from?: Date; to?: Date },
    maxDays: number,
  ): Promise<{ from: Date; to: Date; metrics: Metrics[] }> {
    await this.get(userId, id);
    const to = range.to ?? startOfUtcDay(new Date());
    const from = range.from ?? addDays(to, -29);
    if (addDays(from, maxDays) <= to) {
      throw new HttpError(400, `Date range must be at most ${maxDays} days`, 'RANGE_TOO_LARGE');
    }
    const metrics = await this.db.metrics.findMany({
      where: { repositoryId: id, date: { gte: from, lte: to } },
      orderBy: { date: 'asc' },
    });
    return { from, to, metrics };
  }
}

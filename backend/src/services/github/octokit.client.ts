import { throttling } from '@octokit/plugin-throttling';
import { RequestError } from '@octokit/request-error';
import { Octokit } from '@octokit/rest';
import { LRUCache } from 'lru-cache';
import { hashToken } from '../../lib/crypto.js';
import { HttpError } from '../../lib/http-error.js';
import { logger } from '../../lib/logger.js';
import type {
  GitHubClient,
  GitHubClientFactory,
  GitHubIssue,
  GitHubRepoInfo,
  GitHubWorkflowRun,
} from './github.types.js';

/** Limite di sicurezza sulla paginazione: 10 pagine da 100 elementi per chiamata. */
export const MAX_PAGES = 10;
const PER_PAGE = 100;
const MAX_RETRY_WAIT_SECONDS = 60;

const ThrottledOctokit = Octokit.plugin(throttling);
type ThrottledOctokitInstance = InstanceType<typeof ThrottledOctokit>;

interface CachedResponse {
  etag: string;
  response: unknown;
}

export interface OctokitClientOptions {
  /** Cache ETag condivisa tra client: le chiavi includono l'hash del token. */
  cache?: LRUCache<string, CachedResponse>;
  /** Iniettabile nei test. */
  fetch?: typeof globalThis.fetch;
}

export function createEtagCache(max = 500): LRUCache<string, CachedResponse> {
  return new LRUCache<string, CachedResponse>({ max });
}

export function createOctokitClientFactory(
  options: OctokitClientOptions = {},
): GitHubClientFactory {
  const cache = options.cache ?? createEtagCache();
  return (token) => new OctokitGitHubClient(token, cache, options.fetch);
}

function splitFullName(fullName: string): { owner: string; repo: string } {
  const [owner = '', repo = ''] = fullName.split('/');
  return { owner, repo };
}

function toDate(value: string | null | undefined): Date | null {
  return value ? new Date(value) : null;
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

interface RawRepo {
  id: number;
  full_name: string;
  html_url: string;
  default_branch?: string;
  private: boolean;
}

function toRepoInfo(repo: RawRepo): GitHubRepoInfo {
  return {
    githubId: repo.id,
    fullName: repo.full_name,
    url: repo.html_url,
    defaultBranch: repo.default_branch ?? 'main',
    isPrivate: repo.private,
  };
}

interface RawIssue {
  created_at: string;
  closed_at: string | null;
  pull_request?: { merged_at?: string | null };
}

function toIssue(issue: RawIssue): GitHubIssue {
  return {
    isPullRequest: issue.pull_request !== undefined,
    createdAt: new Date(issue.created_at),
    closedAt: toDate(issue.closed_at),
    mergedAt: toDate(issue.pull_request?.merged_at),
  };
}

/** Traduce gli errori GitHub in errori HTTP comprensibili per il client. */
function mapGitHubError(err: unknown): never {
  if (err instanceof RequestError) {
    if (err.status === 401) {
      throw new HttpError(400, 'GitHub token is invalid or expired', 'GITHUB_TOKEN_INVALID');
    }
    if (err.status === 404) {
      throw new HttpError(404, 'Repository not found on GitHub', 'GITHUB_NOT_FOUND');
    }
    const rateLimited =
      err.status === 429 ||
      (err.status === 403 &&
        (err.response?.headers['x-ratelimit-remaining'] === '0' ||
          /rate limit/i.test(err.message)));
    if (rateLimited) {
      throw new HttpError(503, 'GitHub rate limit exceeded, retry later', 'GITHUB_RATE_LIMITED');
    }
    // 403 senza rate limit: il token non ha i permessi (es. fine-grained senza accesso al repo).
    if (err.status === 403) {
      throw new HttpError(400, 'GitHub token cannot access this resource', 'GITHUB_FORBIDDEN');
    }
  }
  throw err;
}

export class OctokitGitHubClient implements GitHubClient {
  private readonly octokit: ThrottledOctokitInstance;

  constructor(
    token: string,
    cache: LRUCache<string, CachedResponse>,
    fetchImpl?: typeof globalThis.fetch,
  ) {
    this.octokit = new ThrottledOctokit({
      auth: token,
      userAgent: 'devops-dashboard',
      // Gli errori HTTP sono già tradotti da mapGitHubError: nei log Octokit restano a livello debug.
      log: {
        debug: (message: string) => logger.debug(message),
        info: (message: string) => logger.debug(message),
        warn: (message: string) => logger.warn(message),
        error: (message: string) => logger.debug(message),
      },
      request: fetchImpl ? { fetch: fetchImpl } : {},
      throttle: {
        // Un solo retry e solo se l'attesa è breve: il reset del limite primario può essere
        // a un'ora di distanza, meglio fallire subito e riprovare al giro successivo del sync.
        onRateLimit: (retryAfter, opts, _octokit, retryCount) => {
          logger.warn({ retryAfter, url: opts.url }, 'GitHub rate limit hit');
          return retryCount < 1 && retryAfter <= MAX_RETRY_WAIT_SECONDS;
        },
        onSecondaryRateLimit: (retryAfter, opts, _octokit, retryCount) => {
          logger.warn({ retryAfter, url: opts.url }, 'GitHub secondary rate limit hit');
          return retryCount < 1 && retryAfter <= MAX_RETRY_WAIT_SECONDS;
        },
      },
    });

    // Richieste condizionali: con un ETag valido GitHub risponde 304, che non consuma
    // il rate limit primario per le richieste autenticate.
    const scope = hashToken(token);
    this.octokit.hook.wrap('request', async (request, options) => {
      if (options.method !== 'GET') return request(options);
      const key = `${scope}:${this.octokit.request.endpoint(options).url}`;
      const cached = cache.get(key);
      if (cached) options.headers = { ...options.headers, 'if-none-match': cached.etag };
      try {
        const response = await request(options);
        const etag = response.headers.etag;
        if (etag) cache.set(key, { etag, response });
        return response;
      } catch (err) {
        if (cached && err instanceof RequestError && err.status === 304) {
          return cached.response as Awaited<ReturnType<typeof request>>;
        }
        throw err;
      }
    });
  }

  async getLogin(): Promise<string> {
    try {
      const { data } = await this.octokit.rest.users.getAuthenticated();
      return data.login;
    } catch (err) {
      return mapGitHubError(err);
    }
  }

  async listUserRepos(): Promise<GitHubRepoInfo[]> {
    try {
      const repos = await this.collect(
        this.octokit.paginate.iterator(this.octokit.rest.repos.listForAuthenticatedUser, {
          sort: 'pushed',
          per_page: PER_PAGE,
        }),
      );
      return repos.map(toRepoInfo);
    } catch (err) {
      return mapGitHubError(err);
    }
  }

  async getRepo(fullName: string): Promise<GitHubRepoInfo> {
    try {
      const { data } = await this.octokit.rest.repos.get(splitFullName(fullName));
      return toRepoInfo(data);
    } catch (err) {
      return mapGitHubError(err);
    }
  }

  async listOpenIssues(fullName: string): Promise<GitHubIssue[]> {
    try {
      const issues = await this.collect(
        this.octokit.paginate.iterator(this.octokit.rest.issues.listForRepo, {
          ...splitFullName(fullName),
          state: 'open',
          per_page: PER_PAGE,
        }),
      );
      return issues.map(toIssue);
    } catch (err) {
      return mapGitHubError(err);
    }
  }

  async listClosedIssuesSince(fullName: string, since: Date): Promise<GitHubIssue[]> {
    try {
      const issues = await this.collect(
        this.octokit.paginate.iterator(this.octokit.rest.issues.listForRepo, {
          ...splitFullName(fullName),
          state: 'closed',
          since: since.toISOString(),
          per_page: PER_PAGE,
        }),
      );
      return issues.map(toIssue);
    } catch (err) {
      return mapGitHubError(err);
    }
  }

  async listWorkflowRunsSince(fullName: string, since: Date): Promise<GitHubWorkflowRun[]> {
    try {
      const runs = await this.collect(
        this.octokit.paginate.iterator(this.octokit.rest.actions.listWorkflowRunsForRepo, {
          ...splitFullName(fullName),
          created: `>=${toIsoDate(since)}`,
          per_page: PER_PAGE,
        }),
      );
      return runs.map((run) => ({
        createdAt: new Date(run.created_at),
        conclusion: run.conclusion,
      }));
    } catch (err) {
      return mapGitHubError(err);
    }
  }

  /** Paginazione con tetto a MAX_PAGES: oltre, i dati sono parziali e lo segnaliamo nei log. */
  private async collect<T>(pages: AsyncIterable<{ data: T[] }>): Promise<T[]> {
    const items: T[] = [];
    let count = 0;
    for await (const { data } of pages) {
      items.push(...data);
      count += 1;
      if (count >= MAX_PAGES) {
        logger.warn({ pages: count }, 'GitHub pagination cap reached, data may be truncated');
        break;
      }
    }
    return items;
  }
}

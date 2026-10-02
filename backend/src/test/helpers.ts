import type { Response } from 'supertest';
import { HttpError } from '../lib/http-error.js';
import { prisma } from '../lib/prisma.js';
import type {
  GitHubClient,
  GitHubIssue,
  GitHubRepoInfo,
  GitHubWorkflowRun,
} from '../services/github/github.types.js';
import type { EmailMessage, EmailSender } from '../services/email.service.js';

export async function resetDatabase(): Promise<void> {
  await prisma.$executeRawUnsafe(
    'TRUNCATE "PasswordResetToken", "RefreshToken", "Metrics", "Report", "Repository", "User" CASCADE',
  );
}

export class FakeEmailSender implements EmailSender {
  readonly sent: EmailMessage[] = [];
  async send(message: EmailMessage): Promise<void> {
    this.sent.push(message);
  }
}

/** Estrae il valore di un cookie dalla risposta (header Set-Cookie). */
export function getCookie(res: Response, name: string): string | undefined {
  const header = res.headers['set-cookie'] as unknown;
  const cookies = Array.isArray(header) ? (header as string[]) : [];
  const match = cookies.find((c) => c.startsWith(`${name}=`));
  return match?.split(';')[0]?.slice(name.length + 1);
}

export function getSetCookieHeader(res: Response, name: string): string | undefined {
  const header = res.headers['set-cookie'] as unknown;
  const cookies = Array.isArray(header) ? (header as string[]) : [];
  return cookies.find((c) => c.startsWith(`${name}=`));
}

export class FakeGitHubClient implements GitHubClient {
  repos: GitHubRepoInfo[] = [];
  open: GitHubIssue[] = [];
  closed: GitHubIssue[] = [];
  runs: GitHubWorkflowRun[] = [];
  closedSince: Date[] = [];
  fail: Error | null = null;

  constructor(readonly login = 'octocat') {}

  async getLogin(): Promise<string> {
    return this.login;
  }
  async listUserRepos(): Promise<GitHubRepoInfo[]> {
    return this.repos;
  }
  async getRepo(fullName: string): Promise<GitHubRepoInfo> {
    const repo = this.repos.find((r) => r.fullName === fullName);
    if (!repo) throw new HttpError(404, 'Repository not found on GitHub', 'GITHUB_NOT_FOUND');
    return repo;
  }
  async listOpenIssues(): Promise<GitHubIssue[]> {
    if (this.fail) throw this.fail;
    return this.open;
  }
  async listClosedIssuesSince(_fullName: string, since: Date): Promise<GitHubIssue[]> {
    this.closedSince.push(since);
    return this.closed;
  }
  async listWorkflowRunsSince(): Promise<GitHubWorkflowRun[]> {
    return this.runs;
  }
}

export function issueFixture(overrides: Partial<GitHubIssue> = {}): GitHubIssue {
  const createdAt = overrides.createdAt ?? new Date();
  return {
    number: 1,
    title: 'Sample issue',
    url: 'https://github.com/acme/web-app/issues/1',
    isPullRequest: false,
    isDraft: false,
    createdAt,
    updatedAt: createdAt,
    closedAt: null,
    mergedAt: null,
    ...overrides,
  };
}

export function runFixture(overrides: Partial<GitHubWorkflowRun> = {}): GitHubWorkflowRun {
  return {
    name: 'CI',
    url: 'https://github.com/acme/web-app/actions/runs/1',
    createdAt: new Date(),
    conclusion: 'success',
    ...overrides,
  };
}

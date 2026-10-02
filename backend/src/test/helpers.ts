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
import type { GeneratedReport, ReportGenerator } from '../services/reports/report-generator.js';
import type { ReportInput } from '../services/reports/report-input.js';

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

let issueNumber = 0;

/** Issue di test con valori di default ragionevoli. */
export function makeIssue(
  overrides: Partial<GitHubIssue> & Pick<GitHubIssue, 'createdAt'>,
): GitHubIssue {
  issueNumber += 1;
  return {
    number: issueNumber,
    title: `Issue ${issueNumber}`,
    url: `https://github.com/acme/web/issues/${issueNumber}`,
    isPullRequest: false,
    closedAt: null,
    mergedAt: null,
    updatedAt: overrides.closedAt ?? overrides.createdAt,
    ...overrides,
  };
}

export class FakeReportGenerator implements ReportGenerator {
  readonly inputs: ReportInput[] = [];
  async generate(input: ReportInput): Promise<GeneratedReport> {
    this.inputs.push(input);
    return {
      model: 'fake-model',
      analysis: {
        summary: `Riepilogo di ${input.repository}`,
        highlights: [],
        techDebt: [],
        priorities: [],
      },
    };
  }
}

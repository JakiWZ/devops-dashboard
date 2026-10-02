export interface GitHubRepoInfo {
  githubId: number;
  fullName: string;
  url: string;
  defaultBranch: string;
  isPrivate: boolean;
}

/** Issue o pull request (l'endpoint issues di GitHub restituisce entrambe). */
export interface GitHubIssue {
  number: number;
  title: string;
  url: string;
  isPullRequest: boolean;
  /** Solo per le PR: bozza non ancora pronta per la review. */
  isDraft: boolean;
  updatedAt: Date;
  createdAt: Date;
  closedAt: Date | null;
  mergedAt: Date | null;
}

export interface GitHubWorkflowRun {
  /** Nome del workflow (es. "CI"). */
  name: string;
  url: string;
  createdAt: Date;
  conclusion: string | null;
}

/** Porta verso GitHub: l'app dipende da questa interfaccia, i test usano un fake. */
export interface GitHubClient {
  getLogin(): Promise<string>;
  listUserRepos(): Promise<GitHubRepoInfo[]>;
  getRepo(fullName: string): Promise<GitHubRepoInfo>;
  listOpenIssues(fullName: string): Promise<GitHubIssue[]>;
  /** Issue e PR chiuse aggiornate da `since` in poi (superset di quelle chiuse da `since`). */
  listClosedIssuesSince(fullName: string, since: Date): Promise<GitHubIssue[]>;
  listWorkflowRunsSince(fullName: string, since: Date): Promise<GitHubWorkflowRun[]>;
}

export type GitHubClientFactory = (token: string) => GitHubClient;

import type { PrismaClient } from '@prisma/client';
import { HttpError } from '../../lib/http-error.js';
import type { SecretBox } from '../../lib/secret-box.js';
import type { GitHubClient, GitHubClientFactory } from './github.types.js';

export interface GitHubStatus {
  configured: boolean;
  connected: boolean;
  login: string | null;
}

/** Collega l'utente a GitHub tramite personal access token, salvato solo cifrato. */
export class GitHubAccountService {
  constructor(
    private readonly db: PrismaClient,
    private readonly createClient: GitHubClientFactory,
    private readonly secretBox: SecretBox | null,
  ) {}

  async status(userId: string): Promise<GitHubStatus> {
    const user = await this.db.user.findUniqueOrThrow({ where: { id: userId } });
    return {
      configured: this.secretBox !== null,
      connected: user.githubTokenEnc !== null,
      login: user.githubLogin,
    };
  }

  /** Verifica il token su GitHub prima di salvarlo: un token non valido non entra nel DB. */
  async connect(userId: string, token: string): Promise<GitHubStatus> {
    const box = this.requireBox();
    const login = await this.createClient(token).getLogin();
    await this.db.user.update({
      where: { id: userId },
      data: { githubTokenEnc: box.encrypt(token), githubLogin: login },
    });
    return { configured: true, connected: true, login };
  }

  async disconnect(userId: string): Promise<void> {
    await this.db.user.update({
      where: { id: userId },
      data: { githubTokenEnc: null, githubLogin: null },
    });
  }

  async clientFor(userId: string): Promise<GitHubClient> {
    const box = this.requireBox();
    const user = await this.db.user.findUniqueOrThrow({ where: { id: userId } });
    if (!user.githubTokenEnc) {
      throw new HttpError(409, 'Connect a GitHub token first', 'GITHUB_NOT_CONNECTED');
    }
    return this.createClient(box.decrypt(user.githubTokenEnc));
  }

  private requireBox(): SecretBox {
    if (!this.secretBox) {
      throw new HttpError(503, 'GitHub integration is not configured', 'GITHUB_NOT_CONFIGURED');
    }
    return this.secretBox;
  }
}

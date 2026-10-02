import type { PrismaClient } from '@prisma/client';
import Anthropic from '@anthropic-ai/sdk';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Express } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { prisma } from './lib/prisma.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import { authRouter } from './routes/auth.routes.js';
import { healthRouter } from './routes/health.routes.js';
import { reportsRouter } from './routes/reports.routes.js';
import { githubRouter, reposRouter } from './routes/repos.routes.js';
import { usersRouter } from './routes/users.routes.js';
import { AuthService } from './services/auth.service.js';
import { createEmailSender, type EmailSender } from './services/email.service.js';
import { GitHubAccountService } from './services/github/github-account.service.js';
import type { GitHubClientFactory } from './services/github/github.types.js';
import { createOctokitClientFactory } from './services/github/octokit.client.js';
import { prismaProbe, type DatabaseProbe } from './services/health.service.js';
import {
  ClaudeReportGenerator,
  type ReportGenerator,
} from './services/reports/report-generator.js';
import { ReportService } from './services/reports/report.service.js';
import { RepoService } from './services/repos.service.js';
import { RepoSyncService } from './services/sync/sync.service.js';
import { SecretBox } from './lib/secret-box.js';

export interface AppDeps {
  databaseProbe?: DatabaseProbe;
  db?: PrismaClient;
  emailSender?: EmailSender;
  githubClientFactory?: GitHubClientFactory;
  /** null disattiva i report AI; di default Claude se ANTHROPIC_API_KEY è impostata. */
  reportGenerator?: ReportGenerator | null;
}

function defaultReportGenerator(): ReportGenerator | null {
  if (!env.ANTHROPIC_API_KEY) return null;
  return new ClaudeReportGenerator(new Anthropic({ apiKey: env.ANTHROPIC_API_KEY }), {
    model: env.ANTHROPIC_MODEL,
    effort: env.REPORT_EFFORT,
  });
}

export interface GitHubServices {
  accounts: GitHubAccountService;
  repos: RepoService;
  sync: RepoSyncService;
}

export function createGitHubServices(
  db: PrismaClient,
  clientFactory: GitHubClientFactory = createOctokitClientFactory(),
): GitHubServices {
  const secretBox = env.GITHUB_TOKEN_ENC_KEY ? new SecretBox(env.GITHUB_TOKEN_ENC_KEY) : null;
  const accounts = new GitHubAccountService(db, clientFactory, secretBox);
  return {
    accounts,
    repos: new RepoService(db, accounts),
    sync: new RepoSyncService(db, (userId) => accounts.clientFor(userId)),
  };
}

export function createApp({
  databaseProbe = prismaProbe,
  db = prisma,
  emailSender = createEmailSender(),
  githubClientFactory,
  reportGenerator = defaultReportGenerator(),
}: AppDeps = {}): Express {
  const app = express();
  const authService = new AuthService(db, emailSender);
  const github = createGitHubServices(db, githubClientFactory);
  const reports = new ReportService(db, github.accounts, reportGenerator);

  app.disable('x-powered-by');
  // In produzione siamo dietro il proxy di Railway: senza questo il rate limit vedrebbe un solo IP.
  if (env.NODE_ENV === 'production') app.set('trust proxy', 1);
  app.use(helmet());
  app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());
  app.use(pinoHttp({ logger }));
  app.use(
    '/api',
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 300,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
    }),
  );

  app.use('/api/health', healthRouter(databaseProbe));
  app.use('/api/auth', authRouter(authService));
  app.use('/api/users', usersRouter(db));
  app.use('/api/github', githubRouter(github.accounts));
  app.use('/api/repos', reposRouter(github.repos, github.sync));
  app.use('/api/reports', reportsRouter(reports));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

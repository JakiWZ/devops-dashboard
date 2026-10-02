import type { PrismaClient } from '@prisma/client';
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
import type {
  ReportGenerator,
  ReportGeneratorResolver,
} from './services/reports/report-generator.js';
import { AiCatalog } from './services/ai/catalog.js';
import { AiSettingsService } from './services/ai/ai-settings.service.js';
import { aiRouter } from './routes/ai.routes.js';
import { ReportService } from './services/reports/report.service.js';
import { RepoService } from './services/repos.service.js';
import { RepoSyncService } from './services/sync/sync.service.js';
import { SecretBox } from './lib/secret-box.js';

export interface AppDeps {
  databaseProbe?: DatabaseProbe;
  db?: PrismaClient;
  emailSender?: EmailSender;
  githubClientFactory?: GitHubClientFactory;
  /** Nei test: generatore fisso per tutti (null disattiva la generazione, 503). */
  reportGenerator?: ReportGenerator | null;
  /** Nei test: catalogo e fetch finti per i provider AI. */
  aiCatalog?: AiCatalog;
  aiFetch?: typeof globalThis.fetch;
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
  const secretBox = env.secretsKey ? new SecretBox(env.secretsKey) : null;
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
  reportGenerator,
  aiCatalog = new AiCatalog(),
  aiFetch,
}: AppDeps = {}): Express {
  const app = express();
  const authService = new AuthService(db, emailSender);
  const github = createGitHubServices(db, githubClientFactory);
  const secretBox = env.secretsKey ? new SecretBox(env.secretsKey) : null;
  const aiSettings = new AiSettingsService(
    db,
    aiCatalog,
    secretBox,
    env.aiDefault,
    {
      language: env.REPORT_LANGUAGE,
      claudeEffort: env.REPORT_EFFORT,
      claudeFallbacks: env.REPORT_FALLBACKS,
    },
    aiFetch,
  );
  const generators: ReportGeneratorResolver =
    reportGenerator === undefined
      ? aiSettings
      : { generatorFor: () => Promise.resolve(reportGenerator) };
  const reportService = new ReportService(db, github.repos, github.accounts, generators);

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
  app.use('/api/reports', reportsRouter(reportService));
  app.use('/api/ai', aiRouter(aiSettings));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

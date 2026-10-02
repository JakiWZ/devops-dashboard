import { createApp, createGitHubServices } from './app.js';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { prisma } from './lib/prisma.js';
import { createOctokitClientFactory } from './services/github/octokit.client.js';
import { startSyncScheduler } from './services/sync/scheduler.js';

// Una sola factory: API e scheduler condividono la cache ETag.
const githubClientFactory = createOctokitClientFactory();

const server = createApp({ githubClientFactory }).listen(env.PORT, () => {
  logger.info(`API listening on http://localhost:${env.PORT}`);
});

const stopScheduler = startSyncScheduler(
  prisma,
  createGitHubServices(prisma, githubClientFactory).sync,
  env.SYNC_INTERVAL_MINUTES,
);

function shutdown(signal: string): void {
  logger.info({ signal }, 'Shutting down');
  stopScheduler();
  server.close(() => {
    void prisma.$disconnect().finally(() => process.exit(0));
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

import { createApp, createServices } from './app.js';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { prisma } from './lib/prisma.js';
import { createOctokitClientFactory } from './services/github/octokit.client.js';
import { startNotificationScheduler } from './services/notifications/scheduler.js';
import { startSyncScheduler } from './services/sync/scheduler.js';

// Un solo insieme di servizi: API e scheduler condividono cache ETag e listener degli alert.
const services = createServices({ githubClientFactory: createOctokitClientFactory() });

const server = createApp({ services }).listen(env.PORT, () => {
  logger.info(`API listening on http://localhost:${env.PORT}`);
});

const stopSync = startSyncScheduler(prisma, services.github.sync, env.SYNC_INTERVAL_MINUTES);
const stopNotifications = startNotificationScheduler(
  services.notifications,
  env.NOTIFICATION_CHECK_MINUTES,
);

function shutdown(signal: string): void {
  logger.info({ signal }, 'Shutting down');
  stopSync();
  stopNotifications();
  server.close(() => {
    void prisma.$disconnect().finally(() => process.exit(0));
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

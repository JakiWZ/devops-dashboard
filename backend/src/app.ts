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
import { usersRouter } from './routes/users.routes.js';
import { AuthService } from './services/auth.service.js';
import { createEmailSender, type EmailSender } from './services/email.service.js';
import { prismaProbe, type DatabaseProbe } from './services/health.service.js';

export interface AppDeps {
  databaseProbe?: DatabaseProbe;
  db?: PrismaClient;
  emailSender?: EmailSender;
}

export function createApp({
  databaseProbe = prismaProbe,
  db = prisma,
  emailSender = createEmailSender(),
}: AppDeps = {}): Express {
  const app = express();
  const authService = new AuthService(db, emailSender);

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

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

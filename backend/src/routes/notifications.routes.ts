import { timingSafeEqual } from 'node:crypto';
import { Router, type RequestHandler } from 'express';
import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';
import { notificationsController } from '../controllers/notifications.controller.js';
import { HttpError } from '../lib/http-error.js';
import { requireAuth } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import type { NotificationService } from '../services/notifications/notification.service.js';
import { preferencesSchema } from './notifications.schemas.js';

export function notificationsRouter(notifications: NotificationService): Router {
  const router = Router();
  const c = notificationsController(notifications);
  // Ogni prova invia un'email o un messaggio reale: limite dedicato.
  const testLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: env.NOTIFICATION_TEST_RATE_LIMIT,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
  });
  router.use(requireAuth);

  router.get('/', c.settings);
  router.put('/', validateBody(preferencesSchema), c.update);
  router.post('/telegram/link', c.telegramLink);
  router.delete('/telegram', c.telegramDisconnect);
  router.post('/test', testLimit, c.test);

  return router;
}

function sameSecret(received: string, expected: string): boolean {
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Webhook del bot: Telegram firma ogni chiamata con l'header X-Telegram-Bot-Api-Secret-Token
 * impostato in setWebhook. Senza segreto configurato l'endpoint non esiste.
 */
export function telegramRouter(notifications: NotificationService): Router {
  const router = Router();
  const c = notificationsController(notifications);
  const verify: RequestHandler = (req, _res, next) => {
    const received = req.get('x-telegram-bot-api-secret-token');
    const webhookSecret = notifications.telegramWebhookSecret;
    if (!webhookSecret) {
      throw new HttpError(404, 'Not found', 'NOT_FOUND');
    }
    if (!received || !sameSecret(received, webhookSecret)) {
      throw new HttpError(401, 'Invalid webhook secret', 'UNAUTHENTICATED');
    }
    next();
  };
  router.post('/webhook', verify, c.telegramWebhook);
  return router;
}

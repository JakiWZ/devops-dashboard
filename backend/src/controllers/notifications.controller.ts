import type { Request, RequestHandler } from 'express';
import { HttpError } from '../lib/http-error.js';
import type { PreferencesBody } from '../routes/notifications.schemas.js';
import { telegramUpdateSchema } from '../routes/notifications.schemas.js';
import type { NotificationService } from '../services/notifications/notification.service.js';

function userId(req: Request): string {
  if (!req.auth) throw new HttpError(401, 'Not authenticated', 'UNAUTHENTICATED');
  return req.auth.userId;
}

export function notificationsController(notifications: NotificationService) {
  const settings: RequestHandler = async (req, res) => {
    res.json(await notifications.settings(userId(req)));
  };

  const update: RequestHandler = async (req, res) => {
    res.json(await notifications.update(userId(req), req.body as PreferencesBody));
  };

  const telegramLink: RequestHandler = async (req, res) => {
    res.status(201).json(await notifications.createTelegramLink(userId(req)));
  };

  const telegramDisconnect: RequestHandler = async (req, res) => {
    res.json(await notifications.disconnectTelegram(userId(req)));
  };

  const test: RequestHandler = async (req, res) => {
    res.json({ delivered: await notifications.sendTest(userId(req)) });
  };

  const telegramWebhook: RequestHandler = async (req, res) => {
    // Un update che non riconosciamo si conferma comunque: altrimenti Telegram lo rimanda all'infinito.
    const parsed = telegramUpdateSchema.safeParse(req.body);
    if (parsed.success) await notifications.handleTelegramUpdate(parsed.data);
    res.json({ ok: true });
  };

  return { settings, update, telegramLink, telegramDisconnect, test, telegramWebhook };
}

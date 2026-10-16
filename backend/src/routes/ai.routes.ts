import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';
import { aiController } from '../controllers/ai.controller.js';
import { requireAuth } from '../middleware/auth.js';
import type { AiSettingsService } from '../services/ai/ai-settings.service.js';

export function aiRouter(ai: AiSettingsService): Router {
  const router = Router();
  const c = aiController(ai);
  // Verificare una chiave chiama il provider: limite dedicato contro il key testing a raffica.
  const keyCheckLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: env.AI_KEY_CHECK_RATE_LIMIT,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
  });
  router.use(requireAuth);

  router.get('/providers', c.providers);
  router.get('/providers/:id/models', c.models);
  router.post('/verify', keyCheckLimit, c.verify);
  router.get('/settings', c.settings);
  router.put('/credential', keyCheckLimit, c.save);
  router.patch('/credential', c.setModel);
  router.delete('/credential', c.remove);

  return router;
}

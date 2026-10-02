import { Router } from 'express';
import { healthController } from '../controllers/health.controller.js';
import type { DatabaseProbe } from '../services/health.service.js';

export function healthRouter(probe: DatabaseProbe): Router {
  const router = Router();
  router.get('/', healthController(probe));
  return router;
}

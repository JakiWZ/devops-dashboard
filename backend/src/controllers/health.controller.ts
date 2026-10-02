import type { RequestHandler } from 'express';
import { getHealth, type DatabaseProbe } from '../services/health.service.js';

export function healthController(probe: DatabaseProbe): RequestHandler {
  return async (_req, res, next) => {
    try {
      const report = await getHealth(probe);
      res.status(report.status === 'ok' ? 200 : 503).json(report);
    } catch (err) {
      next(err);
    }
  };
}

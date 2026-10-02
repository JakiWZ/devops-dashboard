import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';
import { reportsController } from '../controllers/reports.controller.js';
import { requireAuth } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import type { ReportService } from '../services/reports/report.service.js';
import { generateReportSchema } from './reports.schemas.js';

export function reportsRouter(reports: ReportService): Router {
  const router = Router();
  const c = reportsController(reports);
  // Ogni report è una chiamata a pagamento all'API Claude: limite orario dedicato.
  const generateLimit = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: env.REPORT_RATE_LIMIT,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
  });
  router.use(requireAuth);

  router.get('/', c.list);
  router.post('/', generateLimit, validateBody(generateReportSchema), c.generate);
  router.get('/:id', c.get);
  router.get('/:id/export', c.exportReport);
  router.delete('/:id', c.remove);

  return router;
}

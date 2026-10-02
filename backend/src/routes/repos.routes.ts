import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';
import { githubController, reposController } from '../controllers/repos.controller.js';
import { requireAuth } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import type { GitHubAccountService } from '../services/github/github-account.service.js';
import type { RepoService } from '../services/repos.service.js';
import type { RepoSyncService } from '../services/sync/sync.service.js';
import { githubTokenSchema, trackRepoSchema } from './repos.schemas.js';

export function githubRouter(github: GitHubAccountService): Router {
  const router = Router();
  const c = githubController(github);
  router.use(requireAuth);

  router.get('/', c.status);
  router.put('/token', validateBody(githubTokenSchema), c.connect);
  router.delete('/token', c.disconnect);

  return router;
}

export function reposRouter(repos: RepoService, sync: RepoSyncService): Router {
  const router = Router();
  const c = reposController(repos, sync);
  // Ogni sync consuma rate limit GitHub dell'utente: limite dedicato sui sync manuali.
  const syncLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: env.SYNC_RATE_LIMIT,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
  });
  router.use(requireAuth);

  router.get('/', c.list);
  router.get('/available', c.available);
  router.post('/', validateBody(trackRepoSchema), c.track);
  router.get('/:id', c.get);
  router.delete('/:id', c.remove);
  router.get('/:id/metrics', c.metrics);
  router.post('/:id/sync', syncLimit, c.runSync);

  return router;
}

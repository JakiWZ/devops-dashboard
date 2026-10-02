import type { PrismaClient } from '@prisma/client';
import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { toPublicUser } from '../services/auth.service.js';

export function usersRouter(db: PrismaClient): Router {
  const router = Router();
  router.use(requireAuth, requireRole('ADMIN'));

  router.get('/', async (_req, res) => {
    const users = await db.user.findMany({ orderBy: { createdAt: 'asc' } });
    res.json({ users: users.map(toPublicUser) });
  });

  return router;
}

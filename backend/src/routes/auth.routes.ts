import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';
import { authController } from '../controllers/auth.controller.js';
import { requireAuth } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import type { AuthService } from '../services/auth.service.js';
import {
  credentialsSchema,
  forgotPasswordSchema,
  loginSchema,
  resetPasswordSchema,
} from './auth.schemas.js';

export function authRouter(auth: AuthService): Router {
  const router = Router();
  const c = authController(auth);
  // Limite stretto sugli endpoint che accettano credenziali, contro brute force e spam di email.
  const strict = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: env.AUTH_RATE_LIMIT,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
  });

  router.post('/register', strict, validateBody(credentialsSchema), c.register);
  router.post('/login', strict, validateBody(loginSchema), c.login);
  router.post('/refresh', c.refresh);
  router.post('/logout', c.logout);
  router.get('/me', requireAuth, c.me);
  router.post('/forgot-password', strict, validateBody(forgotPasswordSchema), c.forgotPassword);
  router.post('/reset-password', strict, validateBody(resetPasswordSchema), c.resetPassword);

  return router;
}

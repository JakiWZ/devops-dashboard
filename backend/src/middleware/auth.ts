import type { Role } from '@prisma/client';
import type { RequestHandler } from 'express';
import { HttpError } from '../lib/http-error.js';
import { verifyAccessToken } from '../services/token.service.js';

export const requireAuth: RequestHandler = (req, _res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    throw new HttpError(401, 'Missing bearer token', 'UNAUTHENTICATED');
  }
  req.auth = verifyAccessToken(header.slice('Bearer '.length));
  next();
};

/** Da usare dopo requireAuth. */
export function requireRole(...roles: Role[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.auth) throw new HttpError(401, 'Not authenticated', 'UNAUTHENTICATED');
    if (!roles.includes(req.auth.role)) throw new HttpError(403, 'Forbidden', 'FORBIDDEN');
    next();
  };
}

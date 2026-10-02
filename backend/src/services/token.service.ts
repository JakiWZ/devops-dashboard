import type { Role } from '@prisma/client';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { env } from '../config/env.js';
import { HttpError } from '../lib/http-error.js';

const ISSUER = 'devops-dashboard';

const accessPayloadSchema = z.object({
  sub: z.string(),
  role: z.enum(['ADMIN', 'USER']),
});

export interface AccessTokenClaims {
  userId: string;
  role: Role;
}

export function signAccessToken({ userId, role }: AccessTokenClaims): string {
  return jwt.sign({ role }, env.JWT_ACCESS_SECRET, {
    subject: userId,
    issuer: ISSUER,
    algorithm: 'HS256',
    expiresIn: env.ACCESS_TOKEN_TTL_SECONDS,
  });
}

export function verifyAccessToken(token: string): AccessTokenClaims {
  let decoded: unknown;
  try {
    decoded = jwt.verify(token, env.JWT_ACCESS_SECRET, { issuer: ISSUER, algorithms: ['HS256'] });
  } catch (err) {
    const expired = err instanceof jwt.TokenExpiredError;
    throw new HttpError(
      401,
      expired ? 'Access token expired' : 'Invalid access token',
      expired ? 'TOKEN_EXPIRED' : 'INVALID_TOKEN',
    );
  }
  const parsed = accessPayloadSchema.safeParse(decoded);
  if (!parsed.success) throw new HttpError(401, 'Invalid access token', 'INVALID_TOKEN');
  return { userId: parsed.data.sub, role: parsed.data.role };
}

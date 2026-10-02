import type { CookieOptions, Request, RequestHandler, Response } from 'express';
import { env } from '../config/env.js';
import { HttpError } from '../lib/http-error.js';
import type { AuthService, Session } from '../services/auth.service.js';
import type { Credentials, ResetPasswordInput } from '../routes/auth.schemas.js';

export const REFRESH_COOKIE = 'refresh_token';

// In produzione frontend (Vercel) e API (Railway) sono su domini diversi: serve SameSite=None + Secure.
function cookieOptions(): CookieOptions {
  const production = env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure: production,
    sameSite: production ? 'none' : 'lax',
    path: '/api/auth',
  };
}

function sendSession(res: Response, session: Session, status = 200): void {
  res.cookie(REFRESH_COOKIE, session.refreshToken, {
    ...cookieOptions(),
    expires: session.refreshTokenExpiresAt,
  });
  res.status(status).json({ user: session.user, accessToken: session.accessToken });
}

function readRefreshCookie(req: Request): string | undefined {
  const value: unknown = req.cookies?.[REFRESH_COOKIE];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

export function authController(auth: AuthService) {
  const register: RequestHandler = async (req, res) => {
    const { email, password } = req.body as Credentials;
    sendSession(res, await auth.register(email, password), 201);
  };

  const login: RequestHandler = async (req, res) => {
    const { email, password } = req.body as Credentials;
    sendSession(res, await auth.login(email, password));
  };

  const refresh: RequestHandler = async (req, res) => {
    const token = readRefreshCookie(req);
    if (!token) throw new HttpError(401, 'Missing refresh token', 'INVALID_REFRESH_TOKEN');
    try {
      sendSession(res, await auth.refresh(token));
    } catch (err) {
      res.clearCookie(REFRESH_COOKIE, cookieOptions());
      throw err;
    }
  };

  const logout: RequestHandler = async (req, res) => {
    const token = readRefreshCookie(req);
    if (token) await auth.logout(token);
    res.clearCookie(REFRESH_COOKIE, cookieOptions());
    res.status(204).end();
  };

  const me: RequestHandler = async (req, res) => {
    if (!req.auth) throw new HttpError(401, 'Not authenticated', 'UNAUTHENTICATED');
    res.json({ user: await auth.getUser(req.auth.userId) });
  };

  const forgotPassword: RequestHandler = async (req, res) => {
    const { email } = req.body as { email: string };
    await auth.requestPasswordReset(email);
    res.status(202).json({ message: 'If the email is registered, a reset link has been sent' });
  };

  const resetPassword: RequestHandler = async (req, res) => {
    const { token, password } = req.body as ResetPasswordInput;
    await auth.resetPassword(token, password);
    res.status(204).end();
  };

  return { register, login, refresh, logout, me, forgotPassword, resetPassword };
}

import type { PrismaClient, Role, User } from '@prisma/client';
import { env } from '../config/env.js';
import { generateToken, hashToken } from '../lib/crypto.js';
import { HttpError } from '../lib/http-error.js';
import { logger } from '../lib/logger.js';
import type { EmailSender } from './email.service.js';
import { hashPassword, verifyPassword } from './password.service.js';
import { signAccessToken } from './token.service.js';

const DAY_MS = 24 * 60 * 60 * 1000;
// Hash di nessun utente, calcolato una volta con gli stessi round: confrontarlo quando l'email
// non esiste rende il tempo di risposta simile e non rivela quali account sono registrati.
let dummyHash: Promise<string> | undefined;
const getDummyHash = () => (dummyHash ??= hashPassword('dummy-password-for-timing'));

export interface PublicUser {
  id: string;
  email: string;
  role: Role;
  createdAt: Date;
}

export interface Session {
  user: PublicUser;
  accessToken: string;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
}

export function toPublicUser({ id, email, role, createdAt }: User): PublicUser {
  return { id, email, role, createdAt };
}

const invalidRefresh = () => new HttpError(401, 'Invalid refresh token', 'INVALID_REFRESH_TOKEN');

export class AuthService {
  constructor(
    private readonly db: PrismaClient,
    private readonly email: EmailSender,
  ) {}

  async register(email: string, password: string): Promise<Session> {
    const existing = await this.db.user.findUnique({ where: { email } });
    if (existing) throw new HttpError(409, 'Email already registered', 'EMAIL_TAKEN');
    const user = await this.db.user.create({
      data: { email, passwordHash: await hashPassword(password) },
    });
    return this.createSession(user, generateToken(16));
  }

  async login(email: string, password: string): Promise<Session> {
    const user = await this.db.user.findUnique({ where: { email } });
    const valid = await verifyPassword(password, user?.passwordHash ?? (await getDummyHash()));
    if (!user || !valid)
      throw new HttpError(401, 'Invalid email or password', 'INVALID_CREDENTIALS');
    return this.createSession(user, generateToken(16));
  }

  /** Ruota il refresh token: quello usato viene revocato e ne nasce uno nuovo nella stessa family. */
  async refresh(refreshToken: string): Promise<Session> {
    const stored = await this.db.refreshToken.findUnique({
      where: { tokenHash: hashToken(refreshToken) },
      include: { user: true },
    });
    if (!stored) throw invalidRefresh();

    if (stored.revokedAt) {
      // Un token già ruotato è stato riusato: probabile furto, invalidiamo tutta la sessione.
      await this.revokeFamily(stored.familyId);
      logger.warn({ userId: stored.userId }, 'Refresh token reuse detected, session revoked');
      throw invalidRefresh();
    }
    if (stored.expiresAt <= new Date()) throw invalidRefresh();

    // Revoca condizionale: se due richieste concorrenti usano lo stesso token, solo una vince.
    const { count } = await this.db.refreshToken.updateMany({
      where: { id: stored.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (count === 0) {
      await this.revokeFamily(stored.familyId);
      throw invalidRefresh();
    }
    return this.createSession(stored.user, stored.familyId);
  }

  async logout(refreshToken: string): Promise<void> {
    const stored = await this.db.refreshToken.findUnique({
      where: { tokenHash: hashToken(refreshToken) },
    });
    if (stored) await this.revokeFamily(stored.familyId);
  }

  async getUser(userId: string): Promise<PublicUser> {
    const user = await this.db.user.findUnique({ where: { id: userId } });
    if (!user) throw new HttpError(404, 'User not found', 'USER_NOT_FOUND');
    return toPublicUser(user);
  }

  /** Risponde sempre allo stesso modo, che l'email esista o no (niente user enumeration). */
  async requestPasswordReset(email: string): Promise<void> {
    const user = await this.db.user.findUnique({ where: { email } });
    if (!user) return;

    const token = generateToken();
    await this.db.$transaction([
      // Un solo link valido alla volta: i precedenti non ancora usati vengono invalidati.
      this.db.passwordResetToken.updateMany({
        where: { userId: user.id, usedAt: null },
        data: { usedAt: new Date() },
      }),
      this.db.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash: hashToken(token),
          expiresAt: new Date(Date.now() + env.PASSWORD_RESET_TTL_MINUTES * 60 * 1000),
        },
      }),
    ]);

    const link = `${env.APP_URL}/reset-password?token=${encodeURIComponent(token)}`;
    await this.email.send({
      to: user.email,
      subject: 'Reset your DevOps Dashboard password',
      text: `Use this link to choose a new password (valid ${env.PASSWORD_RESET_TTL_MINUTES} minutes):\n\n${link}\n\nIf you did not request it, ignore this email.`,
    });
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    const invalid = new HttpError(400, 'Invalid or expired reset token', 'INVALID_RESET_TOKEN');
    const stored = await this.db.passwordResetToken.findUnique({
      where: { tokenHash: hashToken(token) },
    });
    if (!stored || stored.usedAt || stored.expiresAt <= new Date()) throw invalid;

    const passwordHash = await hashPassword(newPassword);
    await this.db.$transaction(async (tx) => {
      const { count } = await tx.passwordResetToken.updateMany({
        where: { id: stored.id, usedAt: null },
        data: { usedAt: new Date() },
      });
      if (count === 0) throw invalid;
      await tx.user.update({ where: { id: stored.userId }, data: { passwordHash } });
      // Cambiata la password, tutte le sessioni esistenti decadono.
      await tx.refreshToken.updateMany({
        where: { userId: stored.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    });
  }

  private async createSession(user: User, familyId: string): Promise<Session> {
    const refreshToken = generateToken();
    const refreshTokenExpiresAt = new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * DAY_MS);
    await this.db.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(refreshToken),
        familyId,
        expiresAt: refreshTokenExpiresAt,
      },
    });
    return {
      user: toPublicUser(user),
      accessToken: signAccessToken({ userId: user.id, role: user.role }),
      refreshToken,
      refreshTokenExpiresAt,
    };
  }

  private async revokeFamily(familyId: string): Promise<void> {
    await this.db.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}

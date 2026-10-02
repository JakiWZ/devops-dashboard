import type { Express } from 'express';
import request from 'supertest';
import { createApp } from '../app.js';
import { prisma } from '../lib/prisma.js';
import { hashPassword } from '../services/password.service.js';
import { FakeEmailSender, getCookie, getSetCookieHeader, resetDatabase } from '../test/helpers.js';

const COOKIE = 'refresh_token';
const PASSWORD = 'correct-horse-battery';

let app: Express;
let mailer: FakeEmailSender;

beforeEach(async () => {
  await resetDatabase();
  mailer = new FakeEmailSender();
  app = createApp({ databaseProbe: async () => undefined, emailSender: mailer });
});

afterAll(() => prisma.$disconnect());

async function register(email = 'alice@example.com', password = PASSWORD) {
  return request(app).post('/api/auth/register').send({ email, password });
}

function refresh(token: string | undefined) {
  return request(app)
    .post('/api/auth/refresh')
    .set('Cookie', `${COOKIE}=${token ?? ''}`);
}

describe('register and login', () => {
  it('registers a user, sets an httpOnly refresh cookie and returns a usable access token', async () => {
    const res = await register('Alice@Example.com');

    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ email: 'alice@example.com', role: 'USER' });
    expect(res.body.user).not.toHaveProperty('passwordHash');
    expect(getSetCookieHeader(res, COOKIE)).toMatch(/HttpOnly/);
    expect(getSetCookieHeader(res, COOKIE)).toMatch(/Path=\/api\/auth/);

    const me = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${res.body.accessToken}`);
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe('alice@example.com');
  });

  it('stores a bcrypt hash, never the plain password', async () => {
    await register();
    const user = await prisma.user.findUniqueOrThrow({ where: { email: 'alice@example.com' } });
    expect(user.passwordHash).toMatch(/^\$2[aby]\$/);
    expect(user.passwordHash).not.toContain(PASSWORD);
  });

  it('rejects a duplicate email regardless of case', async () => {
    await register();
    const res = await register('ALICE@example.com');
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('EMAIL_TAKEN');
  });

  it('validates the payload', async () => {
    const res = await register('not-an-email', 'short');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('gives the same answer for a wrong password and an unknown email', async () => {
    await register();
    const wrongPassword = await request(app)
      .post('/api/auth/login')
      .send({ email: 'alice@example.com', password: 'nope-nope-nope' });
    const unknownEmail = await request(app)
      .post('/api/auth/login')
      .send({ email: 'bob@example.com', password: PASSWORD });

    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(wrongPassword.body).toEqual(unknownEmail.body);
  });

  it('logs in with valid credentials', async () => {
    await register();
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'alice@example.com', password: PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toEqual(expect.any(String));
    expect(getCookie(res, COOKIE)).toBeTruthy();
  });
});

describe('access token', () => {
  it('rejects requests without a bearer token', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('rejects a tampered token', async () => {
    const { body } = await register();
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${body.accessToken}x`);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_TOKEN');
  });
});

describe('refresh token rotation', () => {
  it('issues a new refresh token and invalidates the old one', async () => {
    const first = getCookie(await register(), COOKIE);
    const res = await refresh(first);

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toEqual(expect.any(String));
    const second = getCookie(res, COOKIE);
    expect(second).toBeTruthy();
    expect(second).not.toBe(first);
  });

  it('revokes the whole session when a rotated token is reused', async () => {
    const first = getCookie(await register(), COOKIE);
    const second = getCookie(await refresh(first), COOKIE);

    const reuse = await refresh(first);
    expect(reuse.status).toBe(401);
    // Anche il token legittimo più recente è stato revocato.
    expect((await refresh(second)).status).toBe(401);
  });

  it('rejects an expired refresh token', async () => {
    const token = getCookie(await register(), COOKIE);
    await prisma.refreshToken.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await refresh(token)).status).toBe(401);
  });

  it('rejects a missing or unknown refresh token', async () => {
    expect((await request(app).post('/api/auth/refresh')).status).toBe(401);
    expect((await refresh('unknown')).status).toBe(401);
  });

  it('logout revokes the refresh token and clears the cookie', async () => {
    const token = getCookie(await register(), COOKIE);
    const res = await request(app).post('/api/auth/logout').set('Cookie', `${COOKIE}=${token}`);

    expect(res.status).toBe(204);
    expect(getSetCookieHeader(res, COOKIE)).toMatch(/Expires=Thu, 01 Jan 1970/);
    expect((await refresh(token)).status).toBe(401);
  });
});

describe('roles', () => {
  it('lets only admins list users', async () => {
    const user = await register('user@example.com');
    await prisma.user.create({
      data: {
        email: 'admin@example.com',
        passwordHash: await hashPassword(PASSWORD),
        role: 'ADMIN',
      },
    });
    const admin = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@example.com', password: PASSWORD });

    const forbidden = await request(app)
      .get('/api/users')
      .set('Authorization', `Bearer ${user.body.accessToken}`);
    expect(forbidden.status).toBe(403);

    const allowed = await request(app)
      .get('/api/users')
      .set('Authorization', `Bearer ${admin.body.accessToken}`);
    expect(allowed.status).toBe(200);
    expect(allowed.body.users).toHaveLength(2);
  });
});

describe('password reset', () => {
  function extractToken(text: string): string {
    const match = /token=([^\s]+)/.exec(text);
    if (!match?.[1]) throw new Error('No reset token in email');
    return decodeURIComponent(match[1]);
  }

  async function requestReset(email: string) {
    return request(app).post('/api/auth/forgot-password').send({ email });
  }

  it('answers the same for unknown emails and sends nothing', async () => {
    const res = await requestReset('ghost@example.com');
    expect(res.status).toBe(202);
    expect(mailer.sent).toHaveLength(0);
  });

  it('resets the password with the emailed token and revokes existing sessions', async () => {
    const oldRefresh = getCookie(await register(), COOKIE);
    expect((await requestReset('alice@example.com')).status).toBe(202);
    expect(mailer.sent).toHaveLength(1);
    expect(mailer.sent[0]?.to).toBe('alice@example.com');

    const token = extractToken(mailer.sent[0]?.text ?? '');
    const reset = await request(app)
      .post('/api/auth/reset-password')
      .send({ token, password: 'brand-new-password' });
    expect(reset.status).toBe(204);

    const login = (password: string) =>
      request(app).post('/api/auth/login').send({ email: 'alice@example.com', password });
    expect((await login(PASSWORD)).status).toBe(401);
    expect((await login('brand-new-password')).status).toBe(200);
    expect((await refresh(oldRefresh)).status).toBe(401);

    // Il token è monouso.
    const again = await request(app)
      .post('/api/auth/reset-password')
      .send({ token, password: 'another-password' });
    expect(again.status).toBe(400);
  });

  it('invalidates older reset links when a new one is requested', async () => {
    await register();
    await requestReset('alice@example.com');
    await requestReset('alice@example.com');
    const oldToken = extractToken(mailer.sent[0]?.text ?? '');

    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: oldToken, password: 'brand-new-password' });
    expect(res.status).toBe(400);
  });

  it('rejects an expired reset token', async () => {
    await register();
    await requestReset('alice@example.com');
    await prisma.passwordResetToken.updateMany({
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: extractToken(mailer.sent[0]?.text ?? ''), password: 'brand-new-password' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_RESET_TOKEN');
  });
});

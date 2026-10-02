import jwt from 'jsonwebtoken';
import { HttpError } from '../lib/http-error.js';
import { signAccessToken, verifyAccessToken } from './token.service.js';

describe('access tokens', () => {
  it('round-trips user id and role', () => {
    const token = signAccessToken({ userId: 'u1', role: 'ADMIN' });
    expect(verifyAccessToken(token)).toEqual({ userId: 'u1', role: 'ADMIN' });
  });

  it('reports expired tokens with a dedicated code', () => {
    const secret = process.env.JWT_ACCESS_SECRET ?? '';
    const expired = jwt.sign({ role: 'USER', exp: Math.floor(Date.now() / 1000) - 10 }, secret, {
      subject: 'u1',
      issuer: 'devops-dashboard',
    });
    expect(() => verifyAccessToken(expired)).toThrow(
      expect.objectContaining({ status: 401, code: 'TOKEN_EXPIRED' }) as HttpError,
    );
  });

  it('rejects tokens signed with another secret or algorithm "none"', () => {
    const forged = jwt.sign({ role: 'ADMIN' }, 'another-secret-another-secret-another', {
      subject: 'u1',
      issuer: 'devops-dashboard',
    });
    const unsigned = jwt.sign({ role: 'ADMIN' }, '', {
      subject: 'u1',
      issuer: 'devops-dashboard',
      algorithm: 'none',
    });
    expect(() => verifyAccessToken(forged)).toThrow(HttpError);
    expect(() => verifyAccessToken(unsigned)).toThrow(HttpError);
  });
});

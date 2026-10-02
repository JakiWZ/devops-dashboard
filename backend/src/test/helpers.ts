import type { Response } from 'supertest';
import { prisma } from '../lib/prisma.js';
import type { EmailMessage, EmailSender } from '../services/email.service.js';

export async function resetDatabase(): Promise<void> {
  await prisma.$executeRawUnsafe(
    'TRUNCATE "PasswordResetToken", "RefreshToken", "Metrics", "Report", "Repository", "User" CASCADE',
  );
}

export class FakeEmailSender implements EmailSender {
  readonly sent: EmailMessage[] = [];
  async send(message: EmailMessage): Promise<void> {
    this.sent.push(message);
  }
}

/** Estrae il valore di un cookie dalla risposta (header Set-Cookie). */
export function getCookie(res: Response, name: string): string | undefined {
  const header = res.headers['set-cookie'] as unknown;
  const cookies = Array.isArray(header) ? (header as string[]) : [];
  const match = cookies.find((c) => c.startsWith(`${name}=`));
  return match?.split(';')[0]?.slice(name.length + 1);
}

export function getSetCookieHeader(res: Response, name: string): string | undefined {
  const header = res.headers['set-cookie'] as unknown;
  const cookies = Array.isArray(header) ? (header as string[]) : [];
  return cookies.find((c) => c.startsWith(`${name}=`));
}

import { Resend } from 'resend';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
}

export interface EmailSender {
  send(message: EmailMessage): Promise<void>;
}

class ResendEmailSender implements EmailSender {
  private readonly client: Resend;

  constructor(apiKey: string) {
    this.client = new Resend(apiKey);
  }

  async send({ to, subject, text }: EmailMessage): Promise<void> {
    const { error } = await this.client.emails.send({ from: env.EMAIL_FROM, to, subject, text });
    if (error) throw new Error(`Resend error: ${error.message}`);
  }
}

// Senza RESEND_API_KEY non inviamo nulla: in sviluppo il contenuto finisce nei log per poter
// testare il flusso, in produzione è solo un warning (il contenuto contiene token sensibili).
class UnconfiguredEmailSender implements EmailSender {
  async send(message: EmailMessage): Promise<void> {
    if (env.NODE_ENV === 'development') {
      logger.warn({ email: message }, 'RESEND_API_KEY not set: email not sent');
    } else {
      logger.warn(
        { to: message.to, subject: message.subject },
        'RESEND_API_KEY not set: email not sent',
      );
    }
  }
}

export function createEmailSender(): EmailSender {
  return env.RESEND_API_KEY
    ? new ResendEmailSender(env.RESEND_API_KEY)
    : new UnconfiguredEmailSender();
}

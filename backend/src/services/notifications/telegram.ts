import { HttpError } from '../../lib/http-error.js';

/** Limite di Telegram per un singolo messaggio. */
export const TELEGRAM_MAX_LENGTH = 4096;

/** La chat non è più raggiungibile (bot bloccato o chat cancellata): va scollegata. */
export class TelegramChatGoneError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TelegramChatGoneError';
  }
}

/** Porta verso la Bot API di Telegram: i test usano un fake. */
export interface TelegramApi {
  sendMessage(chatId: string, text: string): Promise<void>;
}

export function truncateForTelegram(text: string): string {
  return text.length <= TELEGRAM_MAX_LENGTH ? text : `${text.slice(0, TELEGRAM_MAX_LENGTH - 1)}…`;
}

/**
 * Client minimale della Bot API: basta sendMessage. Testo semplice (niente parse_mode), così i
 * titoli di issue e PR non vanno mai interpretati come markup.
 */
export class TelegramBotApi implements TelegramApi {
  constructor(
    private readonly token: string,
    private readonly fetchFn: typeof globalThis.fetch = globalThis.fetch,
  ) {}

  async sendMessage(chatId: string, text: string): Promise<void> {
    let res: Response;
    try {
      res = await this.fetchFn(`https://api.telegram.org/bot${this.token}/sendMessage`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: truncateForTelegram(text),
          disable_web_page_preview: true,
        }),
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      // Il messaggio d'errore di fetch può contenere l'URL, cioè il token del bot: non lo propaghiamo.
      throw new HttpError(502, 'Telegram is unreachable', 'TELEGRAM_UNREACHABLE');
    }
    if (res.ok) return;
    const body = (await res.json().catch(() => null)) as { description?: unknown } | null;
    const description =
      typeof body?.description === 'string' ? body.description : `HTTP ${res.status}`;
    // 403: bot bloccato dall'utente; 400 "chat not found": chat cancellata o id non valido.
    if (res.status === 403 || (res.status === 400 && /chat not found/i.test(description))) {
      throw new TelegramChatGoneError(description);
    }
    throw new HttpError(502, `Telegram error: ${description}`, 'TELEGRAM_ERROR');
  }
}

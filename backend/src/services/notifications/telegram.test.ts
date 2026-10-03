import { HttpError } from '../../lib/http-error.js';
import { TelegramBotApi, TelegramChatGoneError, TELEGRAM_MAX_LENGTH } from './telegram.js';

function fetchReturning(
  status: number,
  body: unknown,
  calls: Array<{ url: string; body: unknown }>,
) {
  return (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), body: JSON.parse(String(init?.body)) });
    return new Response(JSON.stringify(body), { status });
  }) as typeof globalThis.fetch;
}

describe('TelegramBotApi', () => {
  it('sends plain text, truncated to the Telegram limit', async () => {
    const calls: Array<{ url: string; body: unknown }> = [];
    const api = new TelegramBotApi('123:abc', fetchReturning(200, { ok: true }, calls));
    await api.sendMessage('42', 'x'.repeat(5000));
    expect(calls[0]?.url).toBe('https://api.telegram.org/bot123:abc/sendMessage');
    const body = calls[0]?.body as { chat_id: string; text: string; parse_mode?: string };
    expect(body.chat_id).toBe('42');
    expect(body.text).toHaveLength(TELEGRAM_MAX_LENGTH);
    expect(body.parse_mode).toBeUndefined();
  });

  it('reports a chat that blocked the bot', async () => {
    const api = new TelegramBotApi(
      't',
      fetchReturning(403, { ok: false, description: 'Forbidden: bot was blocked by the user' }, []),
    );
    await expect(api.sendMessage('42', 'hi')).rejects.toBeInstanceOf(TelegramChatGoneError);
  });

  it('never leaks the token when Telegram is unreachable', async () => {
    const api = new TelegramBotApi('secret-token', (async () => {
      throw new TypeError('fetch failed for https://api.telegram.org/botsecret-token/sendMessage');
    }) as typeof globalThis.fetch);
    const error = await api.sendMessage('42', 'hi').catch((err: unknown) => err);
    expect(error).toBeInstanceOf(HttpError);
    expect((error as Error).message).not.toContain('secret-token');
  });
});

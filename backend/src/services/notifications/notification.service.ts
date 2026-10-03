import { Prisma, type NotificationPreference, type PrismaClient } from '@prisma/client';
import { generateToken, hashToken } from '../../lib/crypto.js';
import { HttpError } from '../../lib/http-error.js';
import { logger } from '../../lib/logger.js';
import type { EmailSender } from '../email.service.js';
import type { GitHubIssue, GitHubWorkflowRun } from '../github/github.types.js';
import { findAlerts } from './alerts.js';
import { weeklyDueSlot } from './schedule.js';
import { TelegramChatGoneError, type TelegramApi } from './telegram.js';

/** Validità del link per collegare Telegram. */
const TELEGRAM_LINK_TTL_MS = 15 * 60 * 1000;
/** Righe per messaggio di alert: oltre si rimanda alla dashboard. */
const MAX_ALERT_LINES = 10;

export type Channel = 'email' | 'telegram';

export interface NotificationMessage {
  subject: string;
  text: string;
}

export interface PreferencesInput {
  emailEnabled: boolean;
  telegramEnabled: boolean;
  weeklyReport: boolean;
  ciFailureAlerts: boolean;
  stalledPrAlerts: boolean;
  weeklyDay: number;
  weeklyHour: number;
  timezone: string;
}

export interface NotificationSettings {
  preferences: PreferencesInput;
  email: { address: string; configured: boolean };
  telegram: { configured: boolean; connected: boolean };
}

/** Riga di un report settimanale per un repository. */
export interface WeeklyRepoSummary {
  name: string;
  summary: string;
  reportUrl: string | null;
}

/** Produce il contenuto del report settimanale di un utente (un riassunto per repository). */
export interface WeeklyReportSource {
  summariesFor(userId: string): Promise<WeeklyRepoSummary[]>;
}

/** Messaggio in arrivo dal webhook di Telegram (solo i campi che usiamo). */
export interface TelegramUpdate {
  message?: { chat?: { id?: number; type?: string }; text?: string };
}

export interface TelegramConfig {
  api: TelegramApi;
  /** Username del bot senza @, per il link t.me. */
  botUsername: string;
  /** Segreto atteso nell'header del webhook; senza, il webhook è spento. */
  webhookSecret: string | null;
}

export interface NotificationServiceOptions {
  emailConfigured: boolean;
  telegram: TelegramConfig | null;
  appUrl: string;
  now?: () => Date;
}

const DEFAULTS: PreferencesInput = {
  emailEnabled: false,
  telegramEnabled: false,
  weeklyReport: true,
  ciFailureAlerts: true,
  stalledPrAlerts: true,
  weeklyDay: 1,
  weeklyHour: 8,
  timezone: 'UTC',
};

function toInput(prefs: NotificationPreference | null): PreferencesInput {
  if (!prefs) return { ...DEFAULTS };
  const { emailEnabled, telegramEnabled, weeklyReport, ciFailureAlerts, stalledPrAlerts } = prefs;
  const { weeklyDay, weeklyHour, timezone } = prefs;
  return {
    emailEnabled,
    telegramEnabled,
    weeklyReport,
    ciFailureAlerts,
    stalledPrAlerts,
    weeklyDay,
    weeklyHour,
    timezone,
  };
}

export class NotificationService {
  private readonly now: () => Date;

  constructor(
    private readonly db: PrismaClient,
    private readonly email: EmailSender,
    private readonly weekly: WeeklyReportSource,
    private readonly options: NotificationServiceOptions,
  ) {
    this.now = options.now ?? (() => new Date());
  }

  get telegramConfigured(): boolean {
    return this.options.telegram !== null;
  }

  get telegramWebhookSecret(): string | null {
    return this.options.telegram?.webhookSecret ?? null;
  }

  async settings(userId: string): Promise<NotificationSettings> {
    const user = await this.db.user.findUniqueOrThrow({
      where: { id: userId },
      include: { notificationPrefs: true },
    });
    const prefs = user.notificationPrefs;
    return {
      preferences: toInput(prefs),
      email: { address: user.email, configured: this.options.emailConfigured },
      telegram: {
        configured: this.telegramConfigured,
        connected: Boolean(prefs?.telegramChatId),
      },
    };
  }

  async update(userId: string, input: PreferencesInput): Promise<NotificationSettings> {
    if (input.telegramEnabled) {
      const prefs = await this.db.notificationPreference.findUnique({ where: { userId } });
      if (!prefs?.telegramChatId) {
        throw new HttpError(400, 'Connect Telegram before enabling it', 'TELEGRAM_NOT_CONNECTED');
      }
    }
    await this.db.notificationPreference.upsert({
      where: { userId },
      update: input,
      create: { ...input, userId },
    });
    return this.settings(userId);
  }

  /** Link t.me con codice monouso: aprendolo, il comando /start del bot collega la chat. */
  async createTelegramLink(userId: string): Promise<{ url: string; expiresAt: Date }> {
    const telegram = this.options.telegram;
    if (!telegram) {
      throw new HttpError(
        503,
        'Telegram notifications are not configured',
        'TELEGRAM_NOT_CONFIGURED',
      );
    }
    const code = generateToken(18);
    const expiresAt = new Date(this.now().getTime() + TELEGRAM_LINK_TTL_MS);
    const link = { telegramLinkHash: hashToken(code), telegramLinkExpiry: expiresAt };
    await this.db.notificationPreference.upsert({
      where: { userId },
      update: link,
      create: { ...DEFAULTS, ...link, userId },
    });
    return { url: `https://t.me/${telegram.botUsername}?start=${code}`, expiresAt };
  }

  async disconnectTelegram(userId: string): Promise<NotificationSettings> {
    await this.db.notificationPreference.updateMany({
      where: { userId },
      data: { telegramChatId: null, telegramEnabled: false },
    });
    return this.settings(userId);
  }

  /** Comandi del bot: `/start <codice>` collega la chat, `/stop` la scollega. */
  async handleTelegramUpdate(update: TelegramUpdate): Promise<void> {
    const chat = update.message?.chat;
    const text = update.message?.text?.trim() ?? '';
    if (typeof chat?.id !== 'number') return;
    const chatId = String(chat.id);
    const reply = (message: string) => this.sendTelegram(chatId, message, null);

    if (chat.type !== 'private') {
      await reply('Notifications can only be connected from a private chat with the bot.');
      return;
    }
    if (/^\/stop\b/.test(text)) {
      const { count } = await this.db.notificationPreference.updateMany({
        where: { telegramChatId: chatId },
        data: { telegramChatId: null, telegramEnabled: false },
      });
      await reply(
        count > 0
          ? 'Disconnected. You will not receive notifications here anymore.'
          : 'This chat is not connected to any account.',
      );
      return;
    }
    const code = /^\/start\s+(\S+)/.exec(text)?.[1];
    if (!code) {
      await reply(
        'To connect this chat, open the DevOps Dashboard, go to Settings → Notifications and click "Connect Telegram".',
      );
      return;
    }
    const prefs = await this.db.notificationPreference.findUnique({
      where: { telegramLinkHash: hashToken(code) },
    });
    if (!prefs || !prefs.telegramLinkExpiry || prefs.telegramLinkExpiry < this.now()) {
      await reply('This link has expired. Create a new one from the dashboard.');
      return;
    }
    // Una chat appartiene a un solo account: la si toglie da un eventuale collegamento precedente.
    await this.db.$transaction([
      this.db.notificationPreference.updateMany({
        where: { telegramChatId: chatId, NOT: { id: prefs.id } },
        data: { telegramChatId: null, telegramEnabled: false },
      }),
      this.db.notificationPreference.update({
        where: { id: prefs.id },
        data: {
          telegramChatId: chatId,
          telegramEnabled: true,
          telegramLinkHash: null,
          telegramLinkExpiry: null,
        },
      }),
    ]);
    logger.info({ userId: prefs.userId }, 'Telegram chat connected');
    await reply(
      'Connected ✅ You will receive DevOps Dashboard notifications here. Send /stop to disconnect.',
    );
  }

  async sendTest(userId: string): Promise<Channel[]> {
    const sent = await this.deliver(userId, {
      subject: 'DevOps Dashboard test notification',
      text: `This is a test notification from DevOps Dashboard. Your settings are working.\n\n${this.footer()}`,
    });
    if (sent.attempted.length === 0) {
      throw new HttpError(400, 'Enable at least one channel first', 'NO_CHANNEL_ENABLED');
    }
    if (sent.delivered.length === 0) {
      throw new HttpError(502, 'The notification could not be delivered', 'NOTIFICATION_FAILED');
    }
    return sent.delivered;
  }

  /** Chiamato dopo ogni sync riuscito: invia gli alert nuovi per quel repository. */
  async onRepositorySynced(
    repo: { id: string; userId: string; name: string },
    data: { open: GitHubIssue[]; runs: GitHubWorkflowRun[] },
  ): Promise<void> {
    const prefs = await this.db.notificationPreference.findUnique({
      where: { userId: repo.userId },
    });
    if (!prefs || !this.hasChannel(prefs)) return;
    if (!prefs.ciFailureAlerts && !prefs.stalledPrAlerts) return;

    const candidates = findAlerts({
      ...data,
      now: this.now(),
      notBefore: prefs.createdAt,
      ciFailures: prefs.ciFailureAlerts,
      stalledPrs: prefs.stalledPrAlerts,
    });
    const fresh = [];
    for (const alert of candidates) {
      if (await this.claimEvent(repo.userId, alert.key, alert.kind)) fresh.push(alert);
    }
    if (fresh.length === 0) return;

    const lines = fresh.slice(0, MAX_ALERT_LINES).map((a) => `• ${a.line}`);
    if (fresh.length > MAX_ALERT_LINES) {
      lines.push(`…and ${fresh.length - MAX_ALERT_LINES} more.`);
    }
    await this.deliver(repo.userId, {
      subject: `${repo.name}: ${fresh.length} new alert${fresh.length === 1 ? '' : 's'}`,
      text: `${repo.name}\n\n${lines.join('\n')}\n\n${this.footer()}`,
    });
  }

  /** Invia i report settimanali dovuti; restituisce quanti utenti sono stati serviti. */
  async sendDueWeeklyReports(): Promise<number> {
    const now = this.now();
    const candidates = await this.db.notificationPreference.findMany({
      where: {
        weeklyReport: true,
        OR: [{ emailEnabled: true }, { telegramEnabled: true, telegramChatId: { not: null } }],
      },
    });
    let sent = 0;
    for (const prefs of candidates) {
      const slot = weeklyDueSlot(now, prefs);
      if (!slot) continue;
      // Si marca prima dell'invio: con più istanze o tick sovrapposti un solo invio vince.
      const { count } = await this.db.notificationPreference.updateMany({
        where: {
          id: prefs.id,
          OR: [{ lastWeeklySentAt: null }, { lastWeeklySentAt: { lt: slot } }],
        },
        data: { lastWeeklySentAt: now },
      });
      if (count === 0) continue;
      try {
        await this.sendWeekly(prefs.userId);
        sent += 1;
      } catch (err) {
        logger.error({ err, userId: prefs.userId }, 'Weekly report notification failed');
      }
    }
    return sent;
  }

  private async sendWeekly(userId: string): Promise<void> {
    const summaries = await this.weekly.summariesFor(userId);
    if (summaries.length === 0) return;
    const sections = summaries.map((s) =>
      [s.name, s.summary, s.reportUrl].filter(Boolean).join('\n'),
    );
    await this.deliver(userId, {
      subject: `Weekly DevOps report: ${summaries.length} repositor${summaries.length === 1 ? 'y' : 'ies'}`,
      text: `Weekly DevOps report\n\n${sections.join('\n\n')}\n\n${this.footer()}`,
    });
  }

  private hasChannel(prefs: NotificationPreference): boolean {
    return prefs.emailEnabled || (prefs.telegramEnabled && prefs.telegramChatId !== null);
  }

  private footer(): string {
    return `Manage notifications: ${this.options.appUrl}/settings/notifications`;
  }

  /** Registra l'evento; false se era già stato notificato. */
  private async claimEvent(userId: string, key: string, kind: string): Promise<boolean> {
    try {
      await this.db.notificationEvent.create({ data: { userId, key, kind } });
      return true;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return false;
      throw err;
    }
  }

  /** Invia su ogni canale attivo; un canale che fallisce non blocca gli altri. */
  private async deliver(
    userId: string,
    message: NotificationMessage,
  ): Promise<{ attempted: Channel[]; delivered: Channel[] }> {
    const user = await this.db.user.findUniqueOrThrow({
      where: { id: userId },
      include: { notificationPrefs: true },
    });
    const prefs = user.notificationPrefs;
    const attempted: Channel[] = [];
    const delivered: Channel[] = [];
    if (!prefs) return { attempted, delivered };

    if (prefs.emailEnabled) {
      attempted.push('email');
      try {
        await this.email.send({ to: user.email, subject: message.subject, text: message.text });
        delivered.push('email');
      } catch (err) {
        logger.warn({ err, userId }, 'Email notification failed');
      }
    }
    if (prefs.telegramEnabled && prefs.telegramChatId) {
      attempted.push('telegram');
      if (await this.sendTelegram(prefs.telegramChatId, message.text, prefs.id)) {
        delivered.push('telegram');
      }
    }
    return { attempted, delivered };
  }

  private async sendTelegram(
    chatId: string,
    text: string,
    prefsId: string | null,
  ): Promise<boolean> {
    if (!this.options.telegram) return false;
    try {
      await this.options.telegram.api.sendMessage(chatId, text);
      return true;
    } catch (err) {
      if (err instanceof TelegramChatGoneError && prefsId) {
        // L'utente ha bloccato il bot: si scollega la chat invece di riprovare a ogni notifica.
        await this.db.notificationPreference.update({
          where: { id: prefsId },
          data: { telegramChatId: null, telegramEnabled: false },
        });
        logger.info({ prefsId }, 'Telegram chat unreachable, disconnected');
      } else {
        logger.warn({ err }, 'Telegram notification failed');
      }
      return false;
    }
  }
}

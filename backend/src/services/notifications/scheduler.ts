import { logger } from '../../lib/logger.js';
import type { NotificationService } from './notification.service.js';

/** Controllo periodico in-process dei report settimanali da inviare. */
export function startNotificationScheduler(
  notifications: NotificationService,
  intervalMinutes: number,
): () => void {
  if (intervalMinutes <= 0) {
    logger.info('Weekly report notifications disabled');
    return () => undefined;
  }
  let running = false;
  async function tick(): Promise<void> {
    // Un report per utente può richiedere minuti (una chiamata AI per repository): niente tick sovrapposti.
    if (running) return;
    running = true;
    try {
      const sent = await notifications.sendDueWeeklyReports();
      if (sent > 0) logger.info({ sent }, 'Weekly reports sent');
    } catch (err) {
      logger.error({ err }, 'Notification scheduler tick failed');
    } finally {
      running = false;
    }
  }
  const timer = setInterval(() => void tick(), intervalMinutes * 60 * 1000);
  timer.unref();
  void tick();
  logger.info({ intervalMinutes }, 'Weekly report notifications enabled');
  return () => clearInterval(timer);
}

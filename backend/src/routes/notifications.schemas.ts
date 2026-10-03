import { z } from 'zod';
import { isValidTimezone } from '../services/notifications/schedule.js';

export const preferencesSchema = z.object({
  emailEnabled: z.boolean(),
  telegramEnabled: z.boolean(),
  weeklyReport: z.boolean(),
  ciFailureAlerts: z.boolean(),
  stalledPrAlerts: z.boolean(),
  weeklyDay: z.number().int().min(0).max(6),
  weeklyHour: z.number().int().min(0).max(23),
  timezone: z.string().trim().min(1).max(64).refine(isValidTimezone, 'unknown time zone'),
});

/** Solo i campi dell'update di Telegram che usiamo; il resto viene ignorato. */
export const telegramUpdateSchema = z.object({
  message: z
    .object({
      chat: z.object({ id: z.number(), type: z.string() }).optional(),
      text: z.string().max(4096).optional(),
    })
    .optional(),
});

export type PreferencesBody = z.infer<typeof preferencesSchema>;

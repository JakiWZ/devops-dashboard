import 'dotenv/config';
import { z } from 'zod';

const optionalString = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z.string().min(1).optional(),
);

const encryptionKey = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z
    .string()
    .refine((value) => Buffer.from(value, 'base64').length === 32, 'must be 32 bytes in base64')
    .optional(),
);

const DEFAULT_ANTHROPIC_MODEL = 'claude-opus-5-5';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  CORS_ORIGIN: z
    .string()
    .default('http://localhost:5173')
    .transform((value) =>
      value
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean),
    ),
  DATABASE_URL: z.string().url(),
  JWT_ACCESS_SECRET: z.string().min(32, 'must be at least 32 characters'),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
  PASSWORD_RESET_TTL_MINUTES: z.coerce.number().int().positive().default(30),
  AUTH_RATE_LIMIT: z.coerce.number().int().positive().default(20),
  BCRYPT_ROUNDS: z.coerce.number().int().min(4).max(15).default(12),
  // URL del frontend, usato per costruire il link di reset password.
  APP_URL: z.string().url().default('http://localhost:5173'),
  RESEND_API_KEY: z.string().min(1).optional(),
  EMAIL_FROM: z.string().min(1).default('DevOps Dashboard <onboarding@resend.dev>'),
  // Chiave AES-256 (32 byte in base64) per cifrare i segreti degli utenti (token GitHub, chiavi AI).
  // Senza chiave integrazione GitHub e chiavi AI per utente sono disattivate.
  SECRETS_ENC_KEY: encryptionKey,
  // Nome storico di SECRETS_ENC_KEY, ancora accettato.
  GITHUB_TOKEN_ENC_KEY: encryptionKey,
  // Bot Telegram per le notifiche (token da @BotFather). Senza token il canale Telegram è spento.
  TELEGRAM_BOT_TOKEN: optionalString,
  // Username del bot senza @, per costruire il link t.me usato per collegare la chat.
  TELEGRAM_BOT_USERNAME: optionalString,
  // Segreto che Telegram rimanda nell'header X-Telegram-Bot-Api-Secret-Token del webhook.
  TELEGRAM_WEBHOOK_SECRET: optionalString,
  // Ogni quanti minuti lo scheduler controlla i report settimanali da inviare; 0 lo disattiva.
  NOTIFICATION_CHECK_MINUTES: z.coerce.number().int().min(0).default(5),
  // Notifiche di prova per IP ogni 15 minuti.
  NOTIFICATION_TEST_RATE_LIMIT: z.coerce.number().int().positive().default(5),
  // Intervallo del sync automatico dei repository; 0 lo disattiva.
  SYNC_INTERVAL_MINUTES: z.coerce.number().int().min(0).default(360),
  SYNC_RATE_LIMIT: z.coerce.number().int().positive().default(10),
  // Default AI del server, usato da chi non ha inserito una propria chiave. Il provider è un id
  // del catalogo models.dev (es. anthropic, openai, deepseek, zai-coding-plan).
  AI_PROVIDER: z.string().min(1).default('anthropic'),
  AI_MODEL: optionalString,
  // Senza chiave (né del server né dell'utente) la generazione dei report risponde 503.
  AI_API_KEY: optionalString,
  // Nomi della Fase 4, ancora accettati quando AI_PROVIDER è anthropic.
  ANTHROPIC_API_KEY: optionalString,
  ANTHROPIC_MODEL: optionalString,
  REPORT_EFFORT: z.enum(['low', 'medium', 'high', 'xhigh', 'max']).default('high'),
  // Fallback server-side su un altro modello quando i classificatori di sicurezza rifiutano.
  REPORT_FALLBACKS: z
    .enum(['true', 'false'])
    .default('true')
    .transform((value) => value === 'true'),
  REPORT_LANGUAGE: z.string().min(1).default('English'),
  // Generazioni per IP ogni ora: ogni report costa una chiamata al modello.
  REPORT_RATE_LIMIT: z.coerce.number().int().positive().default(10),
  // Verifiche di chiavi AI per IP ogni 15 minuti.
  AI_KEY_CHECK_RATE_LIMIT: z.coerce.number().int().positive().default(20),
});

export type RawEnv = z.infer<typeof envSchema>;

export type Env = RawEnv & {
  /** Chiave di cifratura effettiva (SECRETS_ENC_KEY o, in mancanza, GITHUB_TOKEN_ENC_KEY). */
  secretsKey: string | undefined;
  /** Default AI del server già risolto, o null se manca la chiave. */
  aiDefault: { provider: string; model: string; apiKey: string } | null;
};

function resolveAiDefault(raw: RawEnv): Env['aiDefault'] {
  const anthropic = raw.AI_PROVIDER === 'anthropic';
  const apiKey = raw.AI_API_KEY ?? (anthropic ? raw.ANTHROPIC_API_KEY : undefined);
  const model =
    raw.AI_MODEL ?? (anthropic ? (raw.ANTHROPIC_MODEL ?? DEFAULT_ANTHROPIC_MODEL) : undefined);
  if (!apiKey) return null;
  if (!model)
    throw new Error('Invalid environment variables: AI_MODEL is required with AI_PROVIDER');
  return { provider: raw.AI_PROVIDER, model, apiKey };
}

export function parseEnv(source: NodeJS.ProcessEnv): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid environment variables: ${issues}`);
  }
  return {
    ...result.data,
    secretsKey: result.data.SECRETS_ENC_KEY ?? result.data.GITHUB_TOKEN_ENC_KEY,
    aiDefault: resolveAiDefault(result.data),
  };
}

export const env = parseEnv(process.env);

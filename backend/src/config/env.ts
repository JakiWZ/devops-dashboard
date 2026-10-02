import 'dotenv/config';
import { z } from 'zod';

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
  // Chiave AES-256 (32 byte in base64) per cifrare i token GitHub. Senza chiave l'integrazione è disattivata.
  GITHUB_TOKEN_ENC_KEY: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z
      .string()
      .refine((value) => Buffer.from(value, 'base64').length === 32, 'must be 32 bytes in base64')
      .optional(),
  ),
  // Intervallo del sync automatico dei repository; 0 lo disattiva.
  SYNC_INTERVAL_MINUTES: z.coerce.number().int().min(0).default(360),
  SYNC_RATE_LIMIT: z.coerce.number().int().positive().default(10),
  // Senza chiave la generazione dei report risponde 503; il resto dell'app funziona.
  ANTHROPIC_API_KEY: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z.string().min(1).optional(),
  ),
  ANTHROPIC_MODEL: z.string().min(1).default('claude-opus-5-5'),
  REPORT_EFFORT: z.enum(['low', 'medium', 'high', 'xhigh', 'max']).default('high'),
  // Fallback server-side su un altro modello quando i classificatori di sicurezza rifiutano.
  REPORT_FALLBACKS: z
    .enum(['true', 'false'])
    .default('true')
    .transform((value) => value === 'true'),
  REPORT_LANGUAGE: z.string().min(1).default('English'),
  // Generazioni per IP ogni ora: ogni report costa una chiamata al modello.
  REPORT_RATE_LIMIT: z.coerce.number().int().positive().default(10),
});

export type Env = z.infer<typeof envSchema>;

export function parseEnv(source: NodeJS.ProcessEnv): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid environment variables: ${issues}`);
  }
  return result.data;
}

export const env = parseEnv(process.env);

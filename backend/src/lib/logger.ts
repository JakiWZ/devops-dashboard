import { pino } from 'pino';
import { env } from '../config/env.js';

// Credenziali mai nei log: token di accesso, cookie di refresh e chiavi API dei provider AI.
export const redact = {
  paths: [
    'req.headers.authorization',
    'req.headers.cookie',
    'res.headers["set-cookie"]',
    '*.apiKey',
    '*.headers.authorization',
    '*.headers["x-api-key"]',
    '*.headers["x-goog-api-key"]',
  ],
  censor: '[redacted]',
};

export const logger = pino({
  level: env.NODE_ENV === 'test' ? 'silent' : env.LOG_LEVEL,
  redact,
  ...(env.NODE_ENV === 'development' && {
    transport: { target: 'pino-pretty', options: { colorize: true } },
  }),
});

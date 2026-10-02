import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import { HttpError } from '../lib/http-error.js';
import { logger } from '../lib/logger.js';

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(new HttpError(404, `Route ${req.method} ${req.path} not found`, 'NOT_FOUND'));
};

export const errorHandler: ErrorRequestHandler = (err: unknown, req, res, _next) => {
  if (err instanceof ZodError) {
    res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'Invalid request', details: err.issues },
    });
    return;
  }

  if (err instanceof HttpError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message } });
    return;
  }

  // Errori inattesi: log completo lato server, messaggio generico al client.
  logger.error({ err, path: req.path }, 'Unhandled error');
  res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
};

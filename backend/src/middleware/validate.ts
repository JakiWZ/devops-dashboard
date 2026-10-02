import type { RequestHandler } from 'express';
import type { z } from 'zod';

/** Valida req.body con lo schema; un errore Zod viene mappato a 400 dall'error handler. */
export function validateBody<T extends z.ZodType>(schema: T): RequestHandler {
  return (req, _res, next) => {
    req.body = schema.parse(req.body);
    next();
  };
}

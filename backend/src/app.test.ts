import express from 'express';
import request from 'supertest';
import { z } from 'zod';
import { createApp } from './app.js';
import { HttpError } from './lib/http-error.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';

describe('GET /api/health', () => {
  it('returns 200 when the database is reachable', async () => {
    const app = createApp({ databaseProbe: async () => undefined });
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ok', database: 'up' });
    expect(typeof res.body.uptime).toBe('number');
  });

  it('returns 503 degraded when the database is down', async () => {
    const app = createApp({
      databaseProbe: async () => {
        throw new Error('connection refused');
      },
    });
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ status: 'degraded', database: 'down' });
  });
});

describe('error handler', () => {
  function appThatThrows(error: unknown) {
    const app = express();
    app.get('/boom', () => {
      throw error;
    });
    app.use(notFoundHandler);
    app.use(errorHandler);
    return app;
  }

  it('maps HttpError to its status and code', async () => {
    const res = await request(appThatThrows(new HttpError(409, 'Conflict', 'CONFLICT'))).get(
      '/boom',
    );
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: { code: 'CONFLICT', message: 'Conflict' } });
  });

  it('maps ZodError to 400 with details', async () => {
    const parsed = z.object({ email: z.string().email() }).safeParse({ email: 'nope' });
    const res = await request(appThatThrows(parsed.error)).get('/boom');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details).toHaveLength(1);
  });

  it('hides internals of unexpected errors', async () => {
    const res = await request(appThatThrows(new Error('secret stack'))).get('/boom');
    expect(res.status).toBe(500);
    expect(res.body).toEqual({
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
    });
  });

  it('returns 404 for unknown routes', async () => {
    const res = await request(createApp({ databaseProbe: async () => undefined })).get('/api/nope');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});

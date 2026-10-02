import type { Request, RequestHandler } from 'express';
import { HttpError } from '../lib/http-error.js';
import type { SaveCredentialInput, SetModelInput, VerifyKeyInput } from '../routes/ai.schemas.js';
import type { AiSettingsService } from '../services/ai/ai-settings.service.js';

function userId(req: Request): string {
  if (!req.auth) throw new HttpError(401, 'Not authenticated', 'UNAUTHENTICATED');
  return req.auth.userId;
}

export function aiController(ai: AiSettingsService) {
  const providers: RequestHandler = async (_req, res) => {
    res.json({ providers: await ai.providers() });
  };

  const models: RequestHandler = async (req, res) => {
    const { id } = req.params;
    if (typeof id !== 'string') throw new HttpError(400, 'Missing provider id', 'BAD_REQUEST');
    res.json({ models: await ai.models(id) });
  };

  const verify: RequestHandler = async (req, res) => {
    const { provider, apiKey } = req.body as VerifyKeyInput;
    res.json({ valid: true, models: await ai.verify(provider, apiKey) });
  };

  const settings: RequestHandler = async (req, res) => {
    res.json(await ai.settings(userId(req)));
  };

  const save: RequestHandler = async (req, res) => {
    res.json(await ai.save(userId(req), req.body as SaveCredentialInput));
  };

  const setModel: RequestHandler = async (req, res) => {
    const { model } = req.body as SetModelInput;
    res.json(await ai.setModel(userId(req), model));
  };

  const remove: RequestHandler = async (req, res) => {
    await ai.remove(userId(req));
    res.status(204).end();
  };

  return { providers, models, verify, settings, save, setModel, remove };
}

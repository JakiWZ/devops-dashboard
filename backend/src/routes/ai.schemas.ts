import { z } from 'zod';

const providerId = z.string().trim().min(1).max(100);
// Le chiavi API reali stanno ben sotto i 512 caratteri; il limite evita payload abusivi.
const apiKey = z.string().trim().min(8).max(512);
const modelId = z.string().trim().min(1).max(200);

export const verifyKeySchema = z.object({ provider: providerId, apiKey });
export const saveCredentialSchema = z.object({ provider: providerId, apiKey, model: modelId });
export const setModelSchema = z.object({ model: modelId });

export type VerifyKeyInput = z.infer<typeof verifyKeySchema>;
export type SaveCredentialInput = z.infer<typeof saveCredentialSchema>;
export type SetModelInput = z.infer<typeof setModelSchema>;

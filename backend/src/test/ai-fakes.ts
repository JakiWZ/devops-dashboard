import type { ProviderMap } from '@opencode-ai/models';
import { AiCatalog } from '../services/ai/catalog.js';

type Json = Record<string, unknown>;

function model(id: string, overrides: Json = {}): Json {
  return {
    id,
    name: id.toUpperCase(),
    attachment: false,
    reasoning: false,
    tool_call: true,
    temperature: true,
    release_date: '2026-01-01',
    last_updated: '2026-01-01',
    modalities: { input: ['text'], output: ['text'] },
    open_weights: false,
    limit: { context: 128000, output: 8000 },
    cost: { input: 1, output: 2 },
    ...overrides,
  };
}

/** Catalogo ridotto con le stesse forme di models.dev, per i test. */
export const fakeProviderMap = {
  'zai-coding-plan': {
    id: 'zai-coding-plan',
    name: 'Z.AI Coding Plan',
    env: ['ZHIPU_API_KEY'],
    npm: '@ai-sdk/openai-compatible',
    api: 'https://api.z.ai/api/coding/paas/v4',
    doc: 'https://docs.z.ai',
    models: {
      'glm-5.3': model('glm-5.3', { release_date: '2026-09-01' }),
      'glm-5.3-flash': model('glm-5.3-flash', { cost: { input: 0.1, output: 0.2 } }),
      'glm-old': model('glm-old', { status: 'deprecated' }),
      'glm-image': model('glm-image', { modalities: { input: ['text'], output: ['image'] } }),
    },
  },
  anthropic: {
    id: 'anthropic',
    name: 'Anthropic',
    env: ['ANTHROPIC_API_KEY'],
    npm: '@ai-sdk/anthropic',
    doc: 'https://docs.anthropic.com',
    models: { 'claude-opus-5-5': model('claude-opus-5-5') },
  },
  google: {
    id: 'google',
    name: 'Google',
    env: ['GEMINI_API_KEY'],
    npm: '@ai-sdk/google',
    doc: 'https://ai.google.dev',
    models: { 'gemini-3-pro': model('gemini-3-pro') },
  },
  bedrock: {
    id: 'bedrock',
    name: 'Amazon Bedrock',
    env: ['AWS_ACCESS_KEY_ID'],
    npm: '@ai-sdk/amazon-bedrock',
    doc: 'https://aws.amazon.com/bedrock',
    models: { 'nova-pro': model('nova-pro') },
  },
} as unknown as ProviderMap;

export function fakeCatalog(map: ProviderMap = fakeProviderMap): AiCatalog {
  return new AiCatalog({
    live: () => Promise.resolve(map),
    snapshot: () => Promise.resolve(map),
  });
}

export function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Risposta Chat Completions in formato OpenAI con il testo dato. */
export function chatCompletion(content: string, finishReason = 'stop'): Response {
  return jsonResponse(200, {
    id: 'chatcmpl-1',
    object: 'chat.completion',
    created: 1790000000,
    model: 'glm-5.3',
    choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: finishReason }],
    usage: { prompt_tokens: 900, completion_tokens: 250, total_tokens: 1150 },
  });
}

import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createGroq } from '@ai-sdk/groq';
import { createMistral } from '@ai-sdk/mistral';
import { createOpenAI } from '@ai-sdk/openai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { createXai } from '@ai-sdk/xai';
import type { LanguageModel } from 'ai';
import type { CatalogProvider, SupportedSdk } from './catalog.js';

type FetchFn = typeof globalThis.fetch;

/** Endpoint fissi dei provider con SDK dedicato (il catalogo non riporta `api` per loro). */
const DEFAULT_BASE_URLS: Record<SupportedSdk, string | null> = {
  '@ai-sdk/openai-compatible': null,
  '@openrouter/ai-sdk-provider': null,
  '@ai-sdk/anthropic': 'https://api.anthropic.com/v1',
  '@ai-sdk/openai': 'https://api.openai.com/v1',
  '@ai-sdk/google': 'https://generativelanguage.googleapis.com/v1beta',
  '@ai-sdk/mistral': 'https://api.mistral.ai/v1',
  '@ai-sdk/groq': 'https://api.groq.com/openai/v1',
  '@ai-sdk/xai': 'https://api.x.ai/v1',
};

export function baseUrl(provider: CatalogProvider): string | null {
  if (!provider.sdk) return null;
  return (provider.api ?? DEFAULT_BASE_URLS[provider.sdk])?.replace(/\/+$/, '') ?? null;
}

/** Costruisce il modello AI SDK per provider, chiave e id del modello scelti dall'utente. */
export function createLanguageModel(
  provider: CatalogProvider,
  apiKey: string,
  modelId: string,
  fetch?: FetchFn,
): LanguageModel {
  const url = baseUrl(provider);
  if (!provider.sdk || !url) throw new Error(`Provider ${provider.id} is not supported`);
  const common = { apiKey, baseURL: url, ...(fetch && { fetch }) };
  switch (provider.sdk) {
    case '@ai-sdk/openai-compatible':
    case '@openrouter/ai-sdk-provider':
      return createOpenAICompatible({
        ...common,
        name: provider.id,
        supportsStructuredOutputs: true,
      })(modelId);
    case '@ai-sdk/anthropic':
      return createAnthropic(common)(modelId);
    case '@ai-sdk/openai':
      // Gli endpoint OpenAI di terze parti di solito implementano solo Chat Completions.
      return provider.api ? createOpenAI(common).chat(modelId) : createOpenAI(common)(modelId);
    case '@ai-sdk/google':
      return createGoogleGenerativeAI(common)(modelId);
    case '@ai-sdk/mistral':
      return createMistral(common)(modelId);
    case '@ai-sdk/groq':
      return createGroq(common)(modelId);
    case '@ai-sdk/xai':
      return createXai(common)(modelId);
  }
}

/** Richiesta all'elenco modelli del provider: il modo più economico per verificare una chiave. */
export function modelsRequest(
  provider: CatalogProvider,
  apiKey: string,
): { url: string; headers: Record<string, string> } | null {
  const url = baseUrl(provider);
  if (!provider.sdk || !url) return null;
  if (provider.sdk === '@ai-sdk/anthropic') {
    return {
      url: `${url}/models?limit=1000`,
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    };
  }
  if (provider.sdk === '@ai-sdk/google') {
    return { url: `${url}/models?pageSize=1000`, headers: { 'x-goog-api-key': apiKey } };
  }
  return { url: `${url}/models`, headers: { Authorization: `Bearer ${apiKey}` } };
}

/** Estrae gli id dei modelli dalle risposte in formato OpenAI/Anthropic (`data`) o Google (`models`). */
export function parseModelIds(body: unknown): string[] | null {
  if (typeof body !== 'object' || body === null) return null;
  const record = body as Record<string, unknown>;
  const list = Array.isArray(record.data)
    ? record.data
    : Array.isArray(record.models)
      ? record.models
      : null;
  if (!list) return null;
  return list
    .map((item: unknown) => {
      if (typeof item !== 'object' || item === null) return null;
      const entry = item as Record<string, unknown>;
      if (typeof entry.id === 'string') return entry.id;
      if (typeof entry.name === 'string') return entry.name.replace(/^models\//, '');
      return null;
    })
    .filter((id): id is string => id !== null);
}

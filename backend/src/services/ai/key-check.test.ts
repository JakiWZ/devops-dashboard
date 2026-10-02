import { HttpError } from '../../lib/http-error.js';
import { chatCompletion, fakeCatalog, jsonResponse } from '../../test/ai-fakes.js';
import { checkApiKey } from './key-check.js';

const catalog = fakeCatalog();

interface Call {
  url: string;
  headers: Headers;
}

function fakeFetch(...responses: Array<Response | Error>) {
  const calls: Call[] = [];
  const fetchFn = async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), headers: new Headers(init?.headers) });
    const next = responses.shift();
    if (!next) throw new Error('unexpected request');
    if (next instanceof Error) throw next;
    return next;
  };
  return { calls, fetchFn: fetchFn as typeof globalThis.fetch };
}

async function provider(id: string) {
  const p = await catalog.provider(id);
  if (!p) throw new Error(`missing ${id}`);
  return p;
}

describe('checkApiKey', () => {
  it('accepts a key and keeps only the catalog models the provider lists', async () => {
    const { calls, fetchFn } = fakeFetch(
      jsonResponse(200, { data: [{ id: 'glm-5.3' }, { id: 'something-else' }] }),
    );
    const result = await checkApiKey(await provider('zai-coding-plan'), 'zai-key-123', fetchFn);
    expect(result.models.map((m) => m.id)).toEqual(['glm-5.3']);
    expect(calls[0]?.url).toBe('https://api.z.ai/api/coding/paas/v4/models');
    expect(calls[0]?.headers.get('authorization')).toBe('Bearer zai-key-123');
  });

  it('rejects a key the provider refuses', async () => {
    const { fetchFn } = fakeFetch(jsonResponse(401, { error: 'invalid key' }));
    await expect(
      checkApiKey(await provider('zai-coding-plan'), 'wrong', fetchFn),
    ).rejects.toMatchObject({ status: 400, code: 'AI_KEY_INVALID' });
  });

  it('uses the provider-specific headers and response shapes', async () => {
    const anthropic = fakeFetch(jsonResponse(200, { data: [{ id: 'claude-opus-5-5' }] }));
    await checkApiKey(await provider('anthropic'), 'sk-ant-1', anthropic.fetchFn);
    expect(anthropic.calls[0]?.headers.get('x-api-key')).toBe('sk-ant-1');

    const google = fakeFetch(jsonResponse(200, { models: [{ name: 'models/gemini-3-pro' }] }));
    const result = await checkApiKey(await provider('google'), 'AIza1', google.fetchFn);
    expect(google.calls[0]?.headers.get('x-goog-api-key')).toBe('AIza1');
    expect(result.models.map((m) => m.id)).toEqual(['gemini-3-pro']);
  });

  it('falls back to a one-token request when there is no models endpoint', async () => {
    const { calls, fetchFn } = fakeFetch(jsonResponse(404, {}), chatCompletion('pong'));
    const result = await checkApiKey(await provider('zai-coding-plan'), 'zai-key', fetchFn);
    // Prova sul modello più economico del catalogo.
    expect(calls[1]?.url).toBe('https://api.z.ai/api/coding/paas/v4/chat/completions');
    expect(result.models).toHaveLength(2);
  });

  it('rejects the key when the one-token request is unauthorized', async () => {
    const { fetchFn } = fakeFetch(jsonResponse(404, {}), jsonResponse(401, { error: 'nope' }));
    await expect(
      checkApiKey(await provider('zai-coding-plan'), 'wrong', fetchFn),
    ).rejects.toMatchObject({ code: 'AI_KEY_INVALID' });
  });

  it('reports an unreachable provider without blaming the key', async () => {
    const { fetchFn } = fakeFetch(new TypeError('fetch failed'));
    const error = await checkApiKey(await provider('zai-coding-plan'), 'k', fetchFn).catch(
      (err: unknown) => err,
    );
    expect(error).toBeInstanceOf(HttpError);
    expect(error).toMatchObject({ status: 502, code: 'AI_PROVIDER_UNREACHABLE' });
  });

  it('refuses providers without a supported SDK', async () => {
    const { fetchFn } = fakeFetch();
    await expect(checkApiKey(await provider('bedrock'), 'k', fetchFn)).rejects.toMatchObject({
      code: 'AI_PROVIDER_UNSUPPORTED',
    });
  });
});

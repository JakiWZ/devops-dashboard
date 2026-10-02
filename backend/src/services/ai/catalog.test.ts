import type { ProviderMap } from '@opencode-ai/models';
import { fakeProviderMap } from '../../test/ai-fakes.js';
import { AiCatalog, normalizeCatalog } from './catalog.js';

describe('normalizeCatalog', () => {
  const providers = normalizeCatalog(fakeProviderMap);
  const zai = providers.find((p) => p.id === 'zai-coding-plan');

  it('keeps only text models that can produce structured output, newest first', () => {
    expect(zai?.models.map((m) => m.id)).toEqual(['glm-5.3', 'glm-5.3-flash']);
  });

  it('marks providers whose SDK we cannot drive as unsupported', () => {
    expect(providers.find((p) => p.id === 'bedrock')?.sdk).toBeNull();
    expect(zai?.sdk).toBe('@ai-sdk/openai-compatible');
    expect(zai?.api).toBe('https://api.z.ai/api/coding/paas/v4');
  });

  it('sorts providers by name', () => {
    expect(providers.map((p) => p.name)).toEqual([
      'Amazon Bedrock',
      'Anthropic',
      'Google',
      'Z.AI Coding Plan',
    ]);
  });
});

/** Sorgente finta che conta le chiamate; `liveFailures` fa fallire le prime richieste live. */
function countingSource(liveFailures = 0) {
  const calls = { live: 0, snapshot: 0 };
  return {
    calls,
    source: {
      live: (): Promise<ProviderMap> => {
        calls.live += 1;
        return calls.live <= liveFailures
          ? Promise.reject(new Error('offline'))
          : Promise.resolve(fakeProviderMap);
      },
      snapshot: (): Promise<ProviderMap> => {
        calls.snapshot += 1;
        return Promise.resolve(fakeProviderMap);
      },
    },
  };
}

describe('AiCatalog', () => {
  it('falls back to the bundled snapshot and retries models.dev after an hour', async () => {
    let now = 0;
    const { calls, source } = countingSource(1);
    const catalog = new AiCatalog(source, () => now);

    await catalog.providers();
    expect(calls).toEqual({ live: 1, snapshot: 1 });

    now = 30 * 60 * 1000;
    await catalog.providers();
    expect(calls.live).toBe(1);

    now = 61 * 60 * 1000;
    await catalog.providers();
    expect(calls).toEqual({ live: 2, snapshot: 1 });
  });

  it('shares one load between concurrent callers', async () => {
    const { calls, source } = countingSource();
    const catalog = new AiCatalog(source);
    await Promise.all([catalog.providers(), catalog.provider('anthropic')]);
    expect(calls.live).toBe(1);
  });
});

import { chatCompletion, fakeCatalog, jsonResponse } from '../../test/ai-fakes.js';
import type { ReportDraft } from '../reports/report-draft.js';
import { buildReportInput } from '../reports/report-input.js';
import { createLanguageModel } from './providers.js';
import { AiSdkReportGenerator } from './sdk-report-generator.js';

const input = buildReportInput({
  repository: { name: 'acme/web', url: 'https://github.com/acme/web', defaultBranch: 'main' },
  metrics: [],
  live: null,
  now: new Date('2026-10-02T12:00:00Z'),
});

const draft: ReportDraft = {
  summary: 'Quiet week.',
  weeklyActivity: 'Nothing happened.',
  highlights: [],
  techDebt: [],
  priorities: [],
};

async function generatorReturning(response: Response) {
  const bodies: Array<Record<string, unknown>> = [];
  const fetchFn = (async (_url: string | URL | Request, init?: RequestInit) => {
    bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
    return response;
  }) as typeof globalThis.fetch;
  const provider = await fakeCatalog().provider('zai-coding-plan');
  if (!provider) throw new Error('missing provider');
  const generator = new AiSdkReportGenerator(
    createLanguageModel(provider, 'key', 'glm-5.3', fetchFn),
    { provider: 'zai-coding-plan', model: 'glm-5.3', language: 'Italian', maxRetries: 0 },
  );
  return { generator, bodies };
}

describe('AiSdkReportGenerator', () => {
  it('asks for structured output and returns the parsed draft with usage', async () => {
    const { generator, bodies } = await generatorReturning(chatCompletion(JSON.stringify(draft)));
    await expect(generator.generate(input)).resolves.toEqual({
      draft,
      provider: 'zai-coding-plan',
      model: 'glm-5.3',
      inputTokens: 900,
      outputTokens: 250,
    });
    expect(bodies[0]).toMatchObject({
      model: 'glm-5.3',
      response_format: { type: 'json_schema' },
    });
    const messages = bodies[0]?.messages as Array<{ role: string; content: string }>;
    expect(messages[0]?.content).toContain('Write all prose in Italian');
  });

  it('maps output that does not match the schema to AI_INVALID_OUTPUT', async () => {
    const { generator } = await generatorReturning(chatCompletion('{"summary": 42}'));
    await expect(generator.generate(input)).rejects.toMatchObject({ code: 'AI_INVALID_OUTPUT' });
  });

  it('maps a truncated answer to AI_TRUNCATED', async () => {
    const { generator } = await generatorReturning(chatCompletion('{"summary": "cut', 'length'));
    await expect(generator.generate(input)).rejects.toMatchObject({ code: 'AI_TRUNCATED' });
  });

  it('maps provider rate limits to AI_RATE_LIMITED', async () => {
    const { generator } = await generatorReturning(jsonResponse(429, { error: 'slow down' }));
    await expect(generator.generate(input)).rejects.toMatchObject({
      status: 503,
      code: 'AI_RATE_LIMITED',
    });
  });
});

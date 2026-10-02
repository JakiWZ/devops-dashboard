import Anthropic from '@anthropic-ai/sdk';
import { HttpError } from '../../lib/http-error.js';
import type { ReportDraft } from './report-draft.js';
import { ClaudeReportGenerator } from './report-generator.js';
import { buildReportInput } from './report-input.js';

const input = buildReportInput({
  repository: { name: 'acme/web', url: 'https://github.com/acme/web', defaultBranch: 'main' },
  metrics: [],
  live: { open: [], closed: [], runs: [] },
  now: new Date('2026-10-02T12:00:00Z'),
});

const draft: ReportDraft = {
  summary: 'Quiet week.',
  weeklyActivity: 'Nothing happened.',
  highlights: [],
  techDebt: [],
  priorities: [],
};

interface CapturedRequest {
  url: string;
  headers: Headers;
  body: Record<string, unknown>;
}

function messageResponse(overrides: Record<string, unknown> = {}) {
  return {
    id: 'msg_1',
    type: 'message',
    role: 'assistant',
    model: 'claude-opus-5-5',
    content: [{ type: 'text', text: JSON.stringify(draft) }],
    stop_reason: 'end_turn',
    stop_sequence: null,
    stop_details: null,
    usage: { input_tokens: 1200, output_tokens: 300 },
    ...overrides,
  };
}

/** Client Anthropic reale con fetch finto: esercita serializzazione e parsing dell'SDK. */
function generatorWith(status: number, body: unknown, fallbacks = true) {
  const requests: CapturedRequest[] = [];
  const fetchImpl = async (url: string | URL | Request, init?: RequestInit) => {
    requests.push({
      url: String(url),
      headers: new Headers(init?.headers),
      body: JSON.parse(String(init?.body)) as Record<string, unknown>,
    });
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  };
  const client = new Anthropic({ apiKey: 'test-key', fetch: fetchImpl, maxRetries: 0 });
  const generator = new ClaudeReportGenerator(client, {
    model: 'claude-opus-5-5',
    effort: 'high',
    fallbacks,
    language: 'Italian',
  });
  return { generator, requests };
}

describe('ClaudeReportGenerator', () => {
  it('sends a structured-output request with server-side fallbacks', async () => {
    const { generator, requests } = generatorWith(200, messageResponse());
    await generator.generate(input);

    const [req] = requests;
    expect(req?.url).toMatch(/\/v1\/messages/);
    expect(req?.headers.get('anthropic-beta')).toContain('server-side-fallback-2026-07-01');
    expect(req?.body).toMatchObject({
      model: 'claude-opus-5-5',
      fallbacks: 'default',
      output_config: { effort: 'high', format: { type: 'json_schema' } },
    });
    expect(req?.body).not.toHaveProperty('thinking');
    expect(String(req?.body.system)).toContain('Write all prose in Italian');
    const content = JSON.stringify(req?.body.messages);
    expect(content).toContain('<repository_data>');
    expect(content).toContain('acme/web');
  });

  it('omits fallbacks when disabled', async () => {
    const { generator, requests } = generatorWith(200, messageResponse(), false);
    await generator.generate(input);
    expect(requests[0]?.body).not.toHaveProperty('fallbacks');
    expect(requests[0]?.headers.get('anthropic-beta') ?? '').not.toContain('server-side-fallback');
  });

  it('returns the parsed draft, the serving model and token usage', async () => {
    const { generator } = generatorWith(200, messageResponse({ model: 'claude-opus-4-8' }));
    await expect(generator.generate(input)).resolves.toEqual({
      draft,
      model: 'claude-opus-4-8',
      inputTokens: 1200,
      outputTokens: 300,
    });
  });

  it.each([
    [{ stop_reason: 'refusal', content: [] }, 'AI_REFUSED'],
    [{ stop_reason: 'max_tokens', content: [{ type: 'text', text: '{"summ' }] }, 'AI_TRUNCATED'],
  ])('maps stop reason %#', async (overrides, code) => {
    const { generator } = generatorWith(200, messageResponse(overrides));
    await expect(generator.generate(input)).rejects.toMatchObject({ status: 502, code });
  });

  it('rejects output that does not match the schema', async () => {
    const { generator } = generatorWith(
      200,
      messageResponse({ content: [{ type: 'text', text: '{"summary": 42}' }] }),
    );
    await expect(generator.generate(input)).rejects.toMatchObject({
      status: 502,
      code: 'AI_INVALID_OUTPUT',
    });
  });

  it.each([
    [429, 503, 'AI_RATE_LIMITED'],
    [401, 503, 'AI_NOT_CONFIGURED'],
    [500, 502, 'AI_ERROR'],
  ])('maps HTTP %i from the API to %i %s', async (apiStatus, status, code) => {
    const { generator } = generatorWith(apiStatus, {
      type: 'error',
      error: { type: 'api_error', message: 'boom' },
    });
    const error = await generator.generate(input).catch((err: unknown) => err);
    expect(error).toBeInstanceOf(HttpError);
    expect(error).toMatchObject({ status, code });
  });
});

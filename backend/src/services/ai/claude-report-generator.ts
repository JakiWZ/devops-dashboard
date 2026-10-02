import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { HttpError } from '../../lib/http-error.js';
import { logger } from '../../lib/logger.js';
import { reportDraftSchema, type ReportDraft } from '../reports/report-draft.js';
import {
  systemPrompt,
  userPrompt,
  type GeneratedDraft,
  type ReportGenerator,
} from '../reports/report-generator.js';
import type { ReportInput } from '../reports/report-input.js';

export interface ClaudeGeneratorOptions {
  model: string;
  effort: 'low' | 'medium' | 'high' | 'xhigh' | 'max';
  fallbacks: boolean;
  language: string;
}

const FALLBACK_BETA = 'server-side-fallback-2026-07-01';

/** Traduce gli errori dell'SDK in errori HTTP: dettagli nei log, messaggio generico al client. */
function mapAnthropicError(err: unknown): never {
  if (err instanceof Anthropic.RateLimitError) {
    throw new HttpError(503, 'AI provider rate limit reached, retry later', 'AI_RATE_LIMITED');
  }
  if (
    err instanceof Anthropic.AuthenticationError ||
    err instanceof Anthropic.PermissionDeniedError
  ) {
    logger.error({ err }, 'Anthropic API rejected the credentials');
    throw new HttpError(503, 'AI provider is not configured correctly', 'AI_NOT_CONFIGURED');
  }
  if (err instanceof Anthropic.APIError) {
    logger.error({ err, status: err.status }, 'Anthropic API error');
    throw new HttpError(502, 'AI provider error', 'AI_ERROR');
  }
  throw err;
}

function parseDraft(content: Anthropic.Beta.BetaContentBlock[]): ReportDraft | null {
  const text = content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('');
  try {
    const result = reportDraftSchema.safeParse(JSON.parse(text));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

/**
 * Adapter dedicato per l'API Anthropic di prima parte: usa effort e fallback server-side, che
 * l'adapter generico di AI SDK non espone. Gli altri provider passano da `AiSdkReportGenerator`.
 */
export class ClaudeReportGenerator implements ReportGenerator {
  constructor(
    private readonly client: Anthropic,
    private readonly options: ClaudeGeneratorOptions,
  ) {}

  async generate(input: ReportInput): Promise<GeneratedDraft> {
    let response;
    try {
      // create() + validazione nostra invece di parse(): parse() lancia un errore generico su JSON
      // troncato prima che si possa leggere stop_reason.
      response = await this.client.beta.messages.create({
        model: this.options.model,
        max_tokens: 16000,
        ...(this.options.fallbacks && { betas: [FALLBACK_BETA], fallbacks: 'default' as const }),
        output_config: {
          effort: this.options.effort,
          format: betaZodOutputFormat(reportDraftSchema),
        },
        system: systemPrompt(this.options.language),
        messages: [{ role: 'user', content: userPrompt(input) }],
      });
    } catch (err) {
      return mapAnthropicError(err);
    }

    if (response.stop_reason === 'refusal') {
      logger.warn({ stopDetails: response.stop_details }, 'Report generation refused');
      throw new HttpError(502, 'The AI model declined to write this report', 'AI_REFUSED');
    }
    if (response.stop_reason === 'max_tokens') {
      throw new HttpError(502, 'The AI response was truncated', 'AI_TRUNCATED');
    }
    const draft = parseDraft(response.content);
    if (!draft) {
      throw new HttpError(
        502,
        'The AI response did not match the report format',
        'AI_INVALID_OUTPUT',
      );
    }
    return {
      draft,
      provider: 'anthropic',
      model: response.model,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    };
  }
}

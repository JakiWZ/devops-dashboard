import {
  APICallError,
  generateText,
  NoObjectGeneratedError,
  Output,
  RetryError,
  type LanguageModel,
} from 'ai';
import { HttpError } from '../../lib/http-error.js';
import { logger } from '../../lib/logger.js';
import { reportDraftSchema } from '../reports/report-draft.js';
import {
  systemPrompt,
  userPrompt,
  type GeneratedDraft,
  type ReportGenerator,
} from '../reports/report-generator.js';
import type { ReportInput } from '../reports/report-input.js';

const MAX_OUTPUT_TOKENS = 16000;

/** Stessi codici di errore dell'adapter Claude: il frontend non deve sapere quale provider gira. */
export function mapAiSdkError(err: unknown, provider: string): never {
  // Dopo i retry automatici di AI SDK conta l'ultimo errore del provider.
  if (RetryError.isInstance(err)) return mapAiSdkError(err.lastError, provider);
  if (NoObjectGeneratedError.isInstance(err)) {
    if (err.finishReason === 'length') {
      throw new HttpError(502, 'The AI response was truncated', 'AI_TRUNCATED');
    }
    if (err.finishReason === 'content-filter') {
      throw new HttpError(502, 'The AI model declined to write this report', 'AI_REFUSED');
    }
    throw new HttpError(
      502,
      'The AI response did not match the report format',
      'AI_INVALID_OUTPUT',
    );
  }
  if (APICallError.isInstance(err)) {
    logger.error({ provider, status: err.statusCode, url: err.url }, 'AI provider error');
    if (err.statusCode === 429) {
      throw new HttpError(503, 'AI provider rate limit reached, retry later', 'AI_RATE_LIMITED');
    }
    if (err.statusCode === 401 || err.statusCode === 403) {
      throw new HttpError(503, 'The AI provider rejected the API key', 'AI_NOT_CONFIGURED');
    }
    throw new HttpError(502, 'AI provider error', 'AI_ERROR');
  }
  throw err;
}

/** Generatore per qualunque provider del catalogo, tramite Vercel AI SDK e output strutturato. */
export class AiSdkReportGenerator implements ReportGenerator {
  constructor(
    private readonly model: LanguageModel,
    private readonly options: {
      provider: string;
      model: string;
      language: string;
      /** Retry di AI SDK su 429/5xx, con backoff esponenziale. */
      maxRetries?: number;
    },
  ) {}

  async generate(input: ReportInput): Promise<GeneratedDraft> {
    try {
      const result = await generateText({
        model: this.model,
        system: systemPrompt(this.options.language),
        prompt: userPrompt(input),
        output: Output.object({ schema: reportDraftSchema, name: 'weekly_report' }),
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        maxRetries: this.options.maxRetries ?? 2,
      });
      // Output.object valida già con lo schema Zod: un JSON fuori formato diventa NoObjectGeneratedError.
      return {
        draft: result.output,
        provider: this.options.provider,
        model: result.response.modelId || this.options.model,
        inputTokens: result.usage.inputTokens ?? null,
        outputTokens: result.usage.outputTokens ?? null,
      };
    } catch (err) {
      return mapAiSdkError(err, this.options.provider);
    }
  }
}

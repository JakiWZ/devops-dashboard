import { APICallError, generateText } from 'ai';
import { HttpError } from '../../lib/http-error.js';
import { logger } from '../../lib/logger.js';
import type { CatalogModel, CatalogProvider } from './catalog.js';
import { createLanguageModel, modelsRequest, parseModelIds } from './providers.js';

type FetchFn = typeof globalThis.fetch;

const TIMEOUT_MS = 15_000;

export interface KeyCheckResult {
  /** Modelli del catalogo utilizzabili con questa chiave, dal più recente. */
  models: CatalogModel[];
}

function invalidKey(): never {
  throw new HttpError(400, 'The API key was rejected by the provider', 'AI_KEY_INVALID');
}

function unreachable(status?: number): never {
  throw new HttpError(
    502,
    status ? `The provider answered with HTTP ${status}` : 'The provider could not be reached',
    'AI_PROVIDER_UNREACHABLE',
  );
}

/** Il modello più economico del catalogo: la prova da 1 token costa il meno possibile. */
function cheapestModel(models: CatalogModel[]): CatalogModel | undefined {
  return [...models].sort((a, b) => (a.cost?.input ?? Infinity) - (b.cost?.input ?? Infinity))[0];
}

/**
 * Verifica una chiave senza salvarla. Prima chiede l'elenco modelli al provider (gratis);
 * se il provider non lo espone, fa una richiesta minima da 1 token.
 */
export async function checkApiKey(
  provider: CatalogProvider,
  apiKey: string,
  fetchFn: FetchFn = globalThis.fetch,
): Promise<KeyCheckResult> {
  const request = modelsRequest(provider, apiKey);
  if (!request) {
    throw new HttpError(
      400,
      `Provider ${provider.name} is not supported yet`,
      'AI_PROVIDER_UNSUPPORTED',
    );
  }

  let res: Response;
  try {
    res = await fetchFn(request.url, {
      headers: request.headers,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    logger.warn({ err, provider: provider.id }, 'AI provider unreachable during key check');
    return unreachable();
  }

  if (res.status === 401 || res.status === 403) return invalidKey();
  if (res.ok) {
    const ids = parseModelIds(await res.json().catch(() => null));
    const available = ids ? new Set(ids) : null;
    const matching = available ? provider.models.filter((m) => available.has(m.id)) : [];
    // Se gli id del provider non combaciano con quelli del catalogo mostriamo l'intero catalogo.
    return { models: matching.length > 0 ? matching : provider.models };
  }
  if (![404, 405, 501].includes(res.status)) return unreachable(res.status);

  // Nessun endpoint /models (capita sui piani "coding" e su alcuni gateway): prova da 1 token.
  const probe = cheapestModel(provider.models);
  if (!probe) return unreachable();
  try {
    await generateText({
      model: createLanguageModel(provider, apiKey, probe.id, fetchFn),
      prompt: 'ping',
      maxOutputTokens: 1,
      maxRetries: 0,
      abortSignal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    if (APICallError.isInstance(err)) {
      if (err.statusCode === 401 || err.statusCode === 403) return invalidKey();
      // 400 (parametri) e 429 (rate limit) arrivano dopo l'autenticazione: la chiave è valida.
      if (err.statusCode !== 400 && err.statusCode !== 429) return unreachable(err.statusCode);
    } else {
      logger.warn({ err, provider: provider.id }, 'AI key probe failed');
      return unreachable();
    }
  }
  return { models: provider.models };
}

import { Models, type ProviderMap } from '@opencode-ai/models';
import { logger } from '../../lib/logger.js';

/** Pacchetti AI SDK che sappiamo usare; gli altri provider del catalogo restano "non supportati". */
export const SUPPORTED_SDKS = [
  '@ai-sdk/openai-compatible',
  '@ai-sdk/anthropic',
  '@ai-sdk/openai',
  '@ai-sdk/google',
  '@ai-sdk/mistral',
  '@ai-sdk/groq',
  '@ai-sdk/xai',
  // OpenRouter espone un'API compatibile OpenAI all'URL indicato nel catalogo.
  '@openrouter/ai-sdk-provider',
] as const;
export type SupportedSdk = (typeof SUPPORTED_SDKS)[number];

export interface CatalogModel {
  id: string;
  name: string;
  reasoning: boolean;
  contextWindow: number | null;
  /** Dollari per milione di token, se noti. */
  cost: { input: number; output: number } | null;
  releaseDate: string | null;
}

export interface CatalogProvider {
  id: string;
  name: string;
  doc: string | null;
  sdk: SupportedSdk | null;
  /** URL base dell'API; null per i provider con endpoint fisso nel loro SDK. */
  api: string | null;
  /** Modelli adatti a generare un report: testo in uscita, output strutturato o tool calling. */
  models: CatalogModel[];
}

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const RETRY_LIVE_MS = 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 5000;

function isSupportedSdk(npm: string | undefined): npm is SupportedSdk {
  return (SUPPORTED_SDKS as readonly string[]).includes(npm ?? '');
}

/** Normalizza la mappa di models.dev nel formato che usiamo: ordinata e già filtrata. */
export function normalizeCatalog(map: ProviderMap): CatalogProvider[] {
  return Object.values(map)
    .map((provider) => {
      const models = Object.values(provider.models)
        .filter(
          (m) =>
            m.status !== 'deprecated' &&
            m.modalities?.output.includes('text') === true &&
            (m.tool_call || m.structured_output === true),
        )
        .map((m): CatalogModel => ({
          id: m.id,
          name: m.name,
          reasoning: m.reasoning,
          contextWindow: m.limit?.context ?? null,
          cost: m.cost ? { input: m.cost.input, output: m.cost.output } : null,
          releaseDate: m.release_date ?? null,
        }))
        .sort((a, b) => (b.releaseDate ?? '').localeCompare(a.releaseDate ?? ''));
      return {
        id: provider.id,
        name: provider.name,
        doc: provider.doc ?? null,
        sdk: isSupportedSdk(provider.npm) ? provider.npm : null,
        api: provider.api ?? null,
        models,
      };
    })
    .filter((provider) => provider.models.length > 0)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export interface CatalogSource {
  /** Catalogo aggiornato da models.dev; può fallire (rete, timeout). */
  live(): Promise<ProviderMap>;
  /** Copia distribuita con il pacchetto npm: sempre disponibile. */
  snapshot(): Promise<ProviderMap>;
}

export const modelsDevSource: CatalogSource = {
  live: () => Models.make().providers({ signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) }),
  // Import dinamico: lo snapshot pesa qualche MB e serve solo se models.dev non risponde.
  snapshot: async () => (await import('@opencode-ai/models/snapshot')).providers,
};

/**
 * Catalogo dei provider AI (lo stesso di OpenCode). Aggiornato da models.dev una volta al giorno;
 * se il servizio non risponde si usa lo snapshot incluso nel pacchetto.
 */
export class AiCatalog {
  private cache: { providers: CatalogProvider[]; expiresAt: number } | null = null;
  private loading: Promise<CatalogProvider[]> | null = null;

  constructor(
    private readonly source: CatalogSource = modelsDevSource,
    private readonly now: () => number = Date.now,
  ) {}

  async providers(): Promise<CatalogProvider[]> {
    if (this.cache && this.cache.expiresAt > this.now()) return this.cache.providers;
    this.loading ??= this.load().finally(() => {
      this.loading = null;
    });
    return this.loading;
  }

  async provider(id: string): Promise<CatalogProvider | null> {
    return (await this.providers()).find((provider) => provider.id === id) ?? null;
  }

  private async load(): Promise<CatalogProvider[]> {
    let map: ProviderMap;
    let fromSnapshot = false;
    try {
      map = await this.source.live();
    } catch (err) {
      logger.warn({ err }, 'models.dev unreachable, using the bundled catalog snapshot');
      map = await this.source.snapshot();
      fromSnapshot = true;
    }
    const providers = normalizeCatalog(map);
    // Con lo snapshot si riprova models.dev prima: la copia locale invecchia.
    this.cache = {
      providers,
      expiresAt: this.now() + (fromSnapshot ? RETRY_LIVE_MS : CACHE_TTL_MS),
    };
    return providers;
  }
}

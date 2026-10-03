import Anthropic from '@anthropic-ai/sdk';
import type { AiCredential, PrismaClient } from '@prisma/client';
import { HttpError } from '../../lib/http-error.js';
import type { SecretBox } from '../../lib/secret-box.js';
import type { ReportGenerator, ReportGeneratorResolver } from '../reports/report-generator.js';
import type { AiCatalog, CatalogModel, CatalogProvider } from './catalog.js';
import { ClaudeReportGenerator } from './claude-report-generator.js';
import { checkApiKey } from './key-check.js';
import { createLanguageModel } from './providers.js';
import { AiSdkReportGenerator } from './sdk-report-generator.js';

type FetchFn = typeof globalThis.fetch;

export interface ServerAiDefault {
  provider: string;
  model: string;
  apiKey: string;
}

export interface GeneratorOptions {
  language: string;
  /** Solo per l'adapter Anthropic di prima parte. */
  claudeEffort: 'low' | 'medium' | 'high' | 'xhigh' | 'max';
  claudeFallbacks: boolean;
}

export interface ProviderSummary {
  id: string;
  name: string;
  doc: string | null;
  supported: boolean;
  modelCount: number;
}

export interface AiSettings {
  /** Chiave dell'utente, se ne ha salvata una. Mai la chiave in chiaro. */
  credential: {
    provider: string;
    providerName: string;
    model: string;
    keyLast4: string;
    updatedAt: Date;
  } | null;
  /** Default del server usato quando l'utente non ha una chiave. */
  serverDefault: { provider: string; model: string } | null;
  /** false se il server non ha SECRETS_ENC_KEY: non si possono salvare chiavi. */
  canStoreKeys: boolean;
}

/**
 * Unico punto in cui l'app sceglie provider e modello AI: chiavi degli utenti, default del
 * server e costruzione del generatore. Ogni funzione AI passa da qui.
 */
export class AiSettingsService implements ReportGeneratorResolver {
  constructor(
    private readonly db: PrismaClient,
    private readonly catalog: AiCatalog,
    private readonly secretBox: SecretBox | null,
    private readonly serverDefault: ServerAiDefault | null,
    private readonly options: GeneratorOptions,
    private readonly fetchFn: FetchFn = globalThis.fetch,
  ) {}

  async providers(): Promise<ProviderSummary[]> {
    return (await this.catalog.providers()).map((p) => ({
      id: p.id,
      name: p.name,
      doc: p.doc,
      supported: p.sdk !== null,
      modelCount: p.models.length,
    }));
  }

  async models(providerId: string): Promise<CatalogModel[]> {
    return (await this.requireProvider(providerId)).models;
  }

  /** Verifica la chiave senza salvarla e restituisce i modelli che si possono scegliere. */
  async verify(providerId: string, apiKey: string): Promise<CatalogModel[]> {
    const provider = await this.requireProvider(providerId);
    return (await checkApiKey(provider, apiKey, this.fetchFn)).models;
  }

  async settings(userId: string): Promise<AiSettings> {
    const credential = await this.db.aiCredential.findUnique({ where: { userId } });
    const provider = credential ? await this.catalog.provider(credential.provider) : null;
    return {
      credential: credential && {
        provider: credential.provider,
        providerName: provider?.name ?? credential.provider,
        model: credential.model,
        keyLast4: credential.keyLast4,
        updatedAt: credential.updatedAt,
      },
      serverDefault: this.serverDefault && {
        provider: this.serverDefault.provider,
        model: this.serverDefault.model,
      },
      canStoreKeys: this.secretBox !== null,
    };
  }

  /** Salva solo chiavi verificate e modelli offerti a quella chiave. */
  async save(
    userId: string,
    input: { provider: string; apiKey: string; model: string },
  ): Promise<AiSettings> {
    const box = this.requireBox();
    const models = await this.verify(input.provider, input.apiKey);
    this.assertModel(models, input.model);
    const data = {
      provider: input.provider,
      model: input.model,
      apiKeyEnc: box.encrypt(input.apiKey),
      keyLast4: input.apiKey.slice(-4),
    };
    await this.db.aiCredential.upsert({
      where: { userId },
      update: data,
      create: { ...data, userId },
    });
    return this.settings(userId);
  }

  async setModel(userId: string, model: string): Promise<AiSettings> {
    const credential = await this.requireCredential(userId);
    this.assertModel(await this.models(credential.provider), model);
    await this.db.aiCredential.update({ where: { userId }, data: { model } });
    return this.settings(userId);
  }

  async remove(userId: string): Promise<void> {
    await this.db.aiCredential.deleteMany({ where: { userId } });
  }

  async generatorFor(userId: string): Promise<ReportGenerator | null> {
    const credential = await this.db.aiCredential.findUnique({ where: { userId } });
    if (credential && this.secretBox) {
      return this.build(
        credential.provider,
        credential.model,
        this.secretBox.decrypt(credential.apiKeyEnc),
      );
    }
    if (!this.serverDefault) return null;
    const { provider, model, apiKey } = this.serverDefault;
    return this.build(provider, model, apiKey);
  }

  private async build(providerId: string, model: string, apiKey: string): Promise<ReportGenerator> {
    // Anthropic di prima parte: adapter dedicato con effort e fallback (vedi README).
    if (providerId === 'anthropic') {
      return new ClaudeReportGenerator(new Anthropic({ apiKey, fetch: this.fetchFn }), {
        model,
        effort: this.options.claudeEffort,
        fallbacks: this.options.claudeFallbacks,
        language: this.options.language,
      });
    }
    const provider = await this.catalog.provider(providerId);
    if (!provider?.sdk) {
      throw new HttpError(503, `AI provider ${providerId} is not available`, 'AI_NOT_CONFIGURED');
    }
    return new AiSdkReportGenerator(createLanguageModel(provider, apiKey, model, this.fetchFn), {
      provider: providerId,
      model,
      language: this.options.language,
    });
  }

  private async requireProvider(id: string): Promise<CatalogProvider> {
    const provider = await this.catalog.provider(id);
    if (!provider) throw new HttpError(404, 'Unknown AI provider', 'AI_PROVIDER_NOT_FOUND');
    if (!provider.sdk) {
      throw new HttpError(
        400,
        `Provider ${provider.name} is not supported yet`,
        'AI_PROVIDER_UNSUPPORTED',
      );
    }
    return provider;
  }

  private async requireCredential(userId: string): Promise<AiCredential> {
    const credential = await this.db.aiCredential.findUnique({ where: { userId } });
    if (!credential) throw new HttpError(404, 'No AI key saved', 'AI_CREDENTIAL_NOT_FOUND');
    return credential;
  }

  private assertModel(models: CatalogModel[], model: string): void {
    if (!models.some((m) => m.id === model)) {
      throw new HttpError(400, 'This model is not available for the API key', 'AI_MODEL_INVALID');
    }
  }

  private requireBox(): SecretBox {
    if (!this.secretBox) {
      throw new HttpError(
        503,
        'Storing API keys is not configured on the server (SECRETS_ENC_KEY)',
        'SECRETS_NOT_CONFIGURED',
      );
    }
    return this.secretBox;
  }
}

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState, type FormEvent } from 'react';
import { aiApi } from '../api/endpoints';
import { errorMessage } from '../api/http';
import type { AiModel, AiProvider, AiSettings } from '../api/schemas';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { ErrorMessage } from '../components/ErrorMessage';
import { Spinner } from '../components/Spinner';
import { queryKeys, useAiProviders, useAiSettings } from '../hooks/queries';

const inputClass =
  'w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900';

function formatCost(model: AiModel): string {
  if (!model.cost) return '';
  if (model.cost.input === 0 && model.cost.output === 0) return 'included';
  return `$${model.cost.input} / $${model.cost.output} per 1M tokens`;
}

function modelLabel(model: AiModel): string {
  const details = [
    model.contextWindow ? `${Math.round(model.contextWindow / 1000)}k context` : null,
    formatCost(model) || null,
  ].filter(Boolean);
  return details.length ? `${model.name} (${details.join(', ')})` : model.name;
}

function CurrentSettings({ settings, onChange }: { settings: AiSettings; onChange: () => void }) {
  const queryClient = useQueryClient();
  const { credential, serverDefault } = settings;
  const models = useQuery({
    queryKey: ['ai', 'models', credential?.provider],
    queryFn: () => aiApi.models(credential?.provider ?? ''),
    enabled: credential !== null,
  });
  const setModel = useMutation({
    mutationFn: aiApi.setModel,
    onSuccess: (data) => queryClient.setQueryData(queryKeys.aiSettings, data),
  });
  const remove = useMutation({
    mutationFn: aiApi.remove,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: queryKeys.aiSettings }),
  });

  if (!credential) {
    return (
      <div className="space-y-3 text-sm">
        <p>
          {serverDefault ? (
            <>
              Reports use the server default: <strong>{serverDefault.provider}</strong> ·{' '}
              <strong>{serverDefault.model}</strong>.
            </>
          ) : (
            'No AI provider is configured yet: add your own key to generate reports.'
          )}
        </p>
        {settings.canStoreKeys ? (
          <Button variant="primary" onClick={onChange}>
            Use my own API key
          </Button>
        ) : (
          <p className="text-slate-600 dark:text-slate-400">
            Personal keys are disabled on this server (missing <code>SECRETS_ENC_KEY</code>).
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4 text-sm">
      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2">
        <dt className="text-slate-600 dark:text-slate-400">Provider</dt>
        <dd className="font-medium">{credential.providerName}</dd>
        <dt className="text-slate-600 dark:text-slate-400">API key</dt>
        <dd className="font-mono">••••{credential.keyLast4}</dd>
        <dt className="text-slate-600 dark:text-slate-400">Model</dt>
        <dd>
          <select
            aria-label="Model"
            value={credential.model}
            disabled={setModel.isPending || !models.data}
            onChange={(e) => setModel.mutate(e.target.value)}
            className="rounded-md border border-slate-300 bg-white px-2 py-1 dark:border-slate-700 dark:bg-slate-900"
          >
            {(
              models.data?.models ?? [{ id: credential.model, name: credential.model } as AiModel]
            ).map((model) => (
              <option key={model.id} value={model.id}>
                {model.name}
              </option>
            ))}
          </select>
        </dd>
      </dl>
      {setModel.error && <ErrorMessage error={setModel.error} />}
      {remove.error && <ErrorMessage error={remove.error} />}
      <div className="flex flex-wrap gap-2">
        <Button onClick={onChange}>Change provider or key</Button>
        <Button
          variant="danger"
          disabled={remove.isPending}
          onClick={() => {
            if (window.confirm('Remove your API key? Reports will use the server default.')) {
              remove.mutate();
            }
          }}
        >
          Remove my key
        </Button>
      </div>
    </div>
  );
}

function ProviderStep({ onPick }: { onPick: (provider: AiProvider) => void }) {
  const providers = useAiProviders();
  const [search, setSearch] = useState('');
  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (providers.data?.providers ?? []).filter(
      (p) => !term || p.name.toLowerCase().includes(term) || p.id.includes(term),
    );
  }, [providers.data, search]);

  if (providers.isPending) return <Spinner label="Loading providers…" />;
  if (providers.error) return <ErrorMessage error={providers.error} />;

  return (
    <div className="space-y-3">
      <input
        type="search"
        aria-label="Search providers"
        placeholder="Search providers (e.g. OpenAI, DeepSeek, Z.AI)"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className={inputClass}
        autoFocus
      />
      <ul className="max-h-96 divide-y divide-slate-100 overflow-y-auto rounded-md border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
        {visible.map((provider) => (
          <li key={provider.id}>
            <button
              type="button"
              disabled={!provider.supported}
              onClick={() => onPick(provider)}
              className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-slate-800"
            >
              <span className="font-medium">{provider.name}</span>
              <span className="text-xs text-slate-500">
                {provider.supported ? `${provider.modelCount} models` : 'not supported yet'}
              </span>
            </button>
          </li>
        ))}
        {visible.length === 0 && (
          <li className="px-3 py-4 text-sm text-slate-500">No provider matches “{search}”.</li>
        )}
      </ul>
    </div>
  );
}

function KeyStep({
  provider,
  onVerified,
  onBack,
}: {
  provider: AiProvider;
  onVerified: (apiKey: string, models: AiModel[]) => void;
  onBack: () => void;
}) {
  const [apiKey, setApiKey] = useState('');
  const verify = useMutation({
    mutationFn: (key: string) => aiApi.verify(provider.id, key),
    onSuccess: (data, key) => onVerified(key, data.models),
    // Chiave rifiutata: il campo si svuota e si riprova (o si torna indietro).
    onError: () => setApiKey(''),
  });

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (apiKey.trim()) verify.mutate(apiKey.trim());
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <p className="text-sm text-slate-600 dark:text-slate-400">
        Paste your {provider.name} API key. It is checked with the provider and stored encrypted
        only after you pick a model.
        {provider.doc && (
          <>
            {' '}
            <a href={provider.doc} target="_blank" rel="noreferrer" className="underline">
              Provider docs
            </a>
          </>
        )}
      </p>
      <input
        type="password"
        aria-label="API key"
        autoComplete="off"
        value={apiKey}
        onChange={(e) => setApiKey(e.target.value)}
        className={inputClass}
        autoFocus
      />
      {verify.error && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-300">
          {errorMessage(verify.error)}. Check the key and try again, or go back to pick another
          provider.
        </p>
      )}
      <div className="flex gap-2">
        <Button onClick={onBack}>Back</Button>
        <Button type="submit" variant="primary" disabled={!apiKey.trim() || verify.isPending}>
          {verify.isPending ? 'Verifying…' : 'Verify key'}
        </Button>
      </div>
    </form>
  );
}

function ModelStep({
  provider,
  apiKey,
  models,
  onSaved,
  onBack,
}: {
  provider: AiProvider;
  apiKey: string;
  models: AiModel[];
  onSaved: (settings: AiSettings) => void;
  onBack: () => void;
}) {
  const [model, setModel] = useState(models[0]?.id ?? '');
  const save = useMutation({
    mutationFn: () => aiApi.save({ provider: provider.id, apiKey, model }),
    onSuccess: onSaved,
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
      className="space-y-3"
    >
      <p role="status" className="text-sm text-emerald-700 dark:text-emerald-300">
        ✓ Key accepted by {provider.name}. Pick the model for your reports.
      </p>
      <select
        aria-label="Model"
        value={model}
        onChange={(e) => setModel(e.target.value)}
        className={inputClass}
      >
        {models.map((m) => (
          <option key={m.id} value={m.id}>
            {modelLabel(m)}
          </option>
        ))}
      </select>
      {save.error && <ErrorMessage error={save.error} />}
      <div className="flex gap-2">
        <Button onClick={onBack}>Back</Button>
        <Button type="submit" variant="primary" disabled={!model || save.isPending}>
          {save.isPending ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </form>
  );
}

type Step =
  | { name: 'current' }
  | { name: 'provider' }
  | { name: 'key'; provider: AiProvider }
  | { name: 'model'; provider: AiProvider; apiKey: string; models: AiModel[] };

const stepTitles: Record<Step['name'], string> = {
  current: 'AI provider',
  provider: '1. Choose a provider',
  key: '2. Paste your API key',
  model: '3. Choose a model',
};

export function AiSettingsPage() {
  const queryClient = useQueryClient();
  const settings = useAiSettings();
  const [step, setStep] = useState<Step>({ name: 'current' });

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold">AI settings</h1>
      <Card
        title={stepTitles[step.name]}
        actions={
          step.name !== 'current' && (
            <button
              type="button"
              className="text-sm underline"
              onClick={() => setStep({ name: 'current' })}
            >
              Cancel
            </button>
          )
        }
      >
        {settings.isPending ? (
          <Spinner />
        ) : settings.error ? (
          <ErrorMessage error={settings.error} onRetry={() => void settings.refetch()} />
        ) : step.name === 'current' ? (
          <CurrentSettings
            settings={settings.data}
            onChange={() => setStep({ name: 'provider' })}
          />
        ) : step.name === 'provider' ? (
          <ProviderStep onPick={(provider) => setStep({ name: 'key', provider })} />
        ) : step.name === 'key' ? (
          <KeyStep
            provider={step.provider}
            onBack={() => setStep({ name: 'provider' })}
            onVerified={(apiKey, models) =>
              setStep({ name: 'model', provider: step.provider, apiKey, models })
            }
          />
        ) : (
          <ModelStep
            provider={step.provider}
            apiKey={step.apiKey}
            models={step.models}
            onBack={() => setStep({ name: 'key', provider: step.provider })}
            onSaved={(data) => {
              queryClient.setQueryData(queryKeys.aiSettings, data);
              setStep({ name: 'current' });
            }}
          />
        )}
      </Card>
      <p className="text-sm text-slate-600 dark:text-slate-400">
        The provider list comes from{' '}
        <a href="https://models.dev" target="_blank" rel="noreferrer" className="underline">
          models.dev
        </a>
        . Your key is used for every AI feature of the dashboard and is billed to your account.
      </p>
    </div>
  );
}

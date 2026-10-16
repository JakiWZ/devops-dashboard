# Piano: provider AI multipli per i report (stile OpenCode)

Stato: **da approvare**. Il codice parte dopo il merge della PR #6 (fase 5).

## Ambito: tutto l'ecosistema

Il provider scelto vale per **ogni** funzione AI del progetto, presente e futura, non solo per
i report:

- un unico modulo `ai/` nel backend: nessun altro file importa un SDK di un provider;
- report di oggi, report schedulati e notifiche con riassunto AI (fase 6) e qualunque funzione
  AI successiva passano da lì e usano la stessa scelta provider/modello dell'utente;
- anche il default del server diventa generico: `AI_PROVIDER`, `AI_MODEL`, `AI_API_KEY` al
  posto di `ANTHROPIC_API_KEY`/`ANTHROPIC_MODEL` (le vecchie variabili restano accettate);
- `SPEC.md` (stack "AI: Claude API" → "AI: qualunque provider del catalogo models.dev"),
  `README.md` e `.env.example` aggiornati di conseguenza, così le fasi successive partono già
  da questa base.

## Cosa vede l'utente

Pagina **Impostazioni → AI**, in tre passi:

1. **Scegli il provider** da una lista con ricerca di tutti i provider conosciuti
   (Anthropic, OpenAI, Google, DeepSeek, Z.AI, Z.AI Coding Plan, Mistral, Groq, OpenRouter, xAI…).
2. **Incolla la chiave** e premi "Verifica".
   - **Funziona** → passi al punto 3.
   - **Non funziona** → la chiave viene scartata (mai salvata), vedi l'errore del provider e
     puoi reinserirla finché non funziona, oppure tornare indietro e cambiare provider.
3. **Scegli il modello** dall'elenco dei modelli di quel provider (es. per Z.AI Coding Plan:
   GLM 5.3, GLM 5.3 Flash…) e salva.

Da lì "Generate report" usa quel provider e quel modello, e lo storico mostra con quale
provider e modello è stato fatto ogni report. Senza chiave dell'utente resta valida quella del
server (`ANTHROPIC_API_KEY`) come oggi.

## Da dove arriva la lista di provider e modelli

Uso lo stesso catalogo di OpenCode: **[models.dev](https://models.dev)**, database open source
di provider e modelli, con un'API JSON pubblica (`/api.json`). Per ogni provider dà il nome,
l'URL dell'API (molti sono compatibili OpenAI), il pacchetto SDK da usare e l'elenco dei
modelli con le capacità (es. se supportano tool calling / output strutturato).

- Il backend scarica il catalogo e lo tiene in cache per 24 ore.
- Nel repository c'è anche una copia del catalogo come riserva, così la pagina funziona anche
  se models.dev non risponde (e nei test).
- Quando possibile, dopo la verifica della chiave incrocio l'elenco con quello che il provider
  stesso dichiara (`GET /models`), così vedi solo i modelli a cui la tua chiave ha accesso.

## Come parlo con tutti questi provider

Uso **Vercel AI SDK** (`ai`), lo stesso approccio di OpenCode: un'unica funzione
`generateObject` con lo schema Zod del report, e un adapter per famiglia:

- `@ai-sdk/openai-compatible` per la maggior parte (DeepSeek, Z.AI, Groq, OpenRouter, Mistral…),
  con l'URL preso dal catalogo;
- `@ai-sdk/anthropic`, `@ai-sdk/openai`, `@ai-sdk/google` per i tre che hanno API proprie.

I provider del catalogo che richiedono un SDK diverso compaiono nella lista come
"non ancora supportato". La validazione Zod sul server resta l'ultima parola: un modello che
risponde fuori formato dà lo stesso errore `AI_INVALID_OUTPUT` di oggi.

**Verifica della chiave**: chiamo l'elenco modelli del provider; se il provider non lo espone,
faccio una richiesta minima (1 token) al modello più economico del catalogo.

**Modelli mostrati**: solo quelli adatti a generare un report (testo in uscita, supporto a
output strutturato o tool calling). Gli altri restano nascosti.

## Modifiche tecniche

1. **Database**: nuova tabella `AiCredential` (utente, provider, chiave cifrata, ultime 4 cifre,
   modello scelto, data). `Report` guadagna il campo `provider`. Cifratura con lo stesso
   `SecretBox` dei token GitHub; la variabile diventa `SECRETS_ENC_KEY` (resta accettata
   `GITHUB_TOKEN_ENC_KEY`).
2. **API**:
   - `GET /api/ai/providers` (catalogo filtrato);
   - `POST /api/ai/verify { provider, apiKey }` (verifica senza salvare, restituisce i modelli);
   - `PUT /api/ai/credential { provider, apiKey, model }` (verifica di nuovo e salva);
   - `GET /api/ai/credential` (provider, ultime 4 cifre, modello: mai la chiave);
   - `DELETE /api/ai/credential`.
3. **Generazione**: l'attuale `ClaudeReportGenerator` viene sostituito da un generatore basato
   su AI SDK, scelto per utente in base alla credenziale salvata.
4. **Frontend**: pagina Impostazioni → AI con i tre passi, e il bottone "Generate report"
   mostra provider e modello in uso.

## Sicurezza

- La chiave viaggia una sola volta dal browser al server, resta cifrata nel database e non
  torna mai al client. Le chiavi che non passano la verifica non vengono salvate.
- La chiave è esclusa dai log (redaction di Pino su body e header).
- Gli URL dei provider vengono dal catalogo sul server, mai dall'utente: niente SSRF.
  Provider personalizzati (Ollama, URL a piacere) restano fuori dalla prima versione.
- I costi vanno sull'account dell'utente; il rate limit sulle generazioni resta.

## Come lo divido

1. **PR A (backend)**: catalogo con cache e copia di riserva, verifica chiave, adapter AI SDK,
   tabella e API, test.
2. **PR B (frontend)**: pagina Impostazioni → AI a tre passi, E2E con le risposte dei
   provider intercettate (chiave valida, chiave sbagliata, torna indietro).

## Test

Catalogo, filtro dei modelli e mappatura degli errori con test unitari; verifica e generazione
con risposte HTTP registrate (fake `fetch`). Non ho chiavi dei vari provider: la prova con
chiavi reali resta un TODO nel README. Nota: dal container di sviluppo models.dev non è
raggiungibile, per questo serve anche la copia di riserva del catalogo.

## Domande per Jaki

1. **Di chi è la chiave**: una per utente, inserita dalla dashboard (consiglio questa), oppure
   una sola per tutta l'app impostata dall'admin?
2. **Ordine**: lo faccio subito dopo la fase 5 e prima della fase 6? (consiglio sì)

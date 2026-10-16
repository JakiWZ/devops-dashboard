# Piano: repository multi-provider (GitHub, GitLab, Bitbucket)

Stato: **superato**: Jaki intendeva i provider AI dei report, vedi `piano-provider-ai-multipli.md`.

## Obiettivo

Ogni utente può collegare uno o più provider e monitorare repository di GitHub, GitLab e
Bitbucket nella stessa dashboard, con le stesse metriche, gli stessi grafici e gli stessi report AI.

## Cosa cambia per l'utente

- Nella pagina Repository la card "GitHub connection" diventa **Connessioni**: una riga per
  provider, ognuna con il proprio token e il proprio stato.
- Per aggiungere un repository si sceglie prima il provider, poi `owner/nome`
  (su GitLab anche `gruppo/sottogruppo/progetto`).
- Liste, dettaglio e report mostrano un badge con il provider.
- I repository Bitbucket non hanno metriche sulle issue (vedi sotto): i grafici delle issue
  mostrano "non disponibile" invece di zero.

## Come ci si collega a ciascun provider

| Provider        | Credenziale                              | Permessi minimi                                        | Note                                                                     |
| --------------- | ---------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------ |
| GitHub          | Fine-grained PAT (come oggi)             | sola lettura: Metadata, Issues, Pull requests, Actions | invariato                                                                |
| GitLab          | Personal/project/group access token      | scope `read_api`                                       | gitlab.com o istanza self-managed (URL configurabile)                    |
| Bitbucket Cloud | API token + email Atlassian (Basic auth) | lettura su repository, pull request, pipeline          | le app password sono state disattivate a giugno 2026: non le supportiamo |

Tutti i token restano cifrati con `GITHUB_TOKEN_ENC_KEY`, rinominata `SCM_TOKEN_ENC_KEY`
(la vecchia variabile resta accettata come alias).

## Mappatura delle metriche

| Metrica             | GitHub             | GitLab                              | Bitbucket Cloud                                                                                           |
| ------------------- | ------------------ | ----------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Issue aperte/chiuse | Issues             | Issues                              | **non disponibile**: Atlassian ha rimosso issue tracker e relative API il 20 agosto 2026 (migrate a Jira) |
| PR aperte/merged    | Pull request       | Merge request (`opened` / `merged`) | Pull request (`OPEN` / `MERGED`)                                                                          |
| Pass rate CI        | Run GitHub Actions | Pipeline (`success` vs `failed`)    | Pipeline (`SUCCESSFUL` vs `FAILED`/`ERROR`)                                                               |

Le pipeline annullate o saltate restano fuori dal calcolo, come oggi le run `cancelled` di GitHub.

## Modifiche tecniche

1. **Porta unica `ScmClient`** al posto di `GitHubClient`, con tipi neutri (`WorkItem` per
   issue e PR/MR, `CiRun` con esito normalizzato). `computeDailyMetrics` e `buildReportInput`
   lavorano solo su questi tipi: un adapter per provider.
   - GitHub: l'attuale client Octokit (con cache ETag) diventa l'adapter GitHub.
   - GitLab: REST v4 via `fetch` (issues, merge_requests, pipelines con `updated_after`/`created_after`).
   - Bitbucket: REST 2.0 via `fetch` (pullrequests, pipelines), niente issue.
2. **Database (migrazione Prisma)**:
   - Nuova tabella `ProviderConnection` (utente, provider, baseUrl, token cifrato, account).
     I token GitHub esistenti vengono copiati lì e le colonne `githubTokenEnc`/`githubLogin`
     rimosse.
   - `Repository`: nuovo campo `provider`, `githubId Int` diventa `externalId String`
     (Bitbucket usa UUID; risolve anche il TODO sull'overflow degli id GitHub), riferimento alla
     connessione; unicità su (utente, provider, externalId).
   - `Metrics.openIssues` e `closedIssues` diventano nullable (Bitbucket).
3. **API**: `/api/github*` diventa `/api/connections` (GET, PUT `/:provider`, DELETE `/:provider`);
   `GET /api/repos/available?provider=...`; `POST /api/repos { provider, fullName }`.
   Il frontend è nostro, quindi niente alias di compatibilità.
4. **Report AI**: il prompt riceve il nome del provider e usa la terminologia giusta
   ("merge request" su GitLab); con le issue assenti lo dichiara invece di inventarle.
5. **Sicurezza**: l'URL di GitLab self-managed è scelto dall'utente, quindi è un rischio SSRF.
   Accettiamo solo `https` e rifiutiamo host che risolvono a indirizzi privati o loopback,
   salvo `ALLOW_PRIVATE_SCM_HOSTS=true` per installazioni interne.

## Come lo divido

1. **PR A: refactor senza cambi visibili.** Porta `ScmClient`, migrazione dati e API
   `/api/connections` con il solo GitHub. Tutti i test esistenti devono restare verdi.
2. **PR B: GitLab.** Adapter, connessione con URL personalizzabile, UI, test.
3. **PR C: Bitbucket.** Adapter, metriche issue nullable, UI con "non disponibile", test.

Ogni PR si può mergiare da sola.

## Test

Gli adapter vengono testati con risposte HTTP registrate (fake `fetch`), come oggi Octokit.
Paginazione, mappatura degli stati, errori 401/403/404 e rate limit sono coperti.
Gli E2E aggiungono una connessione finta e un repository per provider tramite il seed.
Non ho account GitLab o Bitbucket di prova: la verifica contro le API reali resta un TODO
nel README, con i passi per farla.

## Fuori da questo piano

- OAuth per i tre provider (oggi solo token, come per GitHub).
- Bitbucket Data Center/Server, Azure DevOps, Gitea.
- Issue di Jira per i repository Bitbucket.

## Domande per Jaki

1. **Ordine**: lo faccio subito dopo la fase 5 e prima della fase 6 (notifiche)?
   Consiglio sì, perché le notifiche si appoggiano al modello dei repository.
2. **GitLab self-managed**: lo includo, con la protezione SSRF descritta?
   Consiglio sì: chi usa GitLab spesso lo ha in casa.

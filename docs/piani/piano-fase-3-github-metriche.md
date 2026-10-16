# Piano Fase 3 — GitHub e metriche

> Nota: la **Fase 2 (Auth)** di SPEC.md è già implementata nella PR #2 (CI verde, mergeable, in attesa di merge).
> Questo piano copre quindi la fase successiva. Da avviare dopo il merge della PR #2, perché le route
> `/api/repos` usano `requireAuth` introdotto lì.

## Obiettivo

Collegare l'utente ai suoi repository GitHub, sincronizzare issue/PR/CI e salvare metriche giornaliere,
con cache e rate limiting. Solo backend (la UI è Fase 5).

## Cosa fare

1. **Client GitHub** (`src/services/github/`)
   - Wrapper tipizzato su REST v3 con `@octokit/rest` (+ `@octokit/plugin-throttling` per rispettare i rate limit).
   - Interfaccia `GitHubClient` iniettabile in `createApp`, come la probe del DB, così i test usano un fake.
   - Token: un PAT per utente salvato cifrato (AES-256-GCM, chiave da env `GITHUB_TOKEN_ENC_KEY`).
     OAuth GitHub resta TODO (richiede una OAuth App).
2. **Schema Prisma** (nuova migrazione)
   - `User.githubTokenEnc` (nullable).
   - `Repository`: `fullName`, `defaultBranch`, `isPrivate`, `syncStatus` (`IDLE|SYNCING|FAILED`), `lastSyncError`.
3. **API `/api/repos`** (tutte autenticate, Zod su input)
   - `PUT /api/me/github-token` — salva/verifica il PAT.
   - `GET /api/repos/available` — repo GitHub dell'utente non ancora tracciati.
   - `POST /api/repos` — traccia un repo (`owner/name`); `DELETE /api/repos/:id`.
   - `GET /api/repos`, `GET /api/repos/:id` — lista e dettaglio con ultimo snapshot.
   - `GET /api/repos/:id/metrics?from&to` — serie giornaliera per i grafici.
   - `POST /api/repos/:id/sync` — sync manuale (rate limit dedicato).
4. **Sync e metriche** (`src/services/sync/`)
   - Per repo: issue aperte/chiuse, PR aperte/merged, esito ultimi workflow run → `ciPassRate`.
   - Upsert su `Metrics(repositoryId, date)` (vincolo già presente); aggiorna `lastSyncedAt`.
   - Backfill degli ultimi 30 giorni al primo sync, poi incrementale.
   - Sync periodico in-process con `node-cron` (ogni 6h, disattivabile da env). Coda/worker esterno scartato per ora.
5. **Cache**: in-memory con TTL (es. `lru-cache`) sulle chiamate GitHub + ETag/`If-None-Match`
   (le risposte 304 non consumano rate limit). Redis rimandato al deploy, interfaccia `Cache` per sostituirla.
6. **Seed demo**: dati realistici per 2–3 repo e 90 giorni di metriche, così la dashboard ha dati senza token GitHub.
7. **Test Jest**: client GitHub con `nock`/fake, calcolo metriche (incl. `ciPassRate` senza run),
   sync idempotente, ownership (un utente non vede i repo altrui → 404), cifratura token.
8. **README**: endpoint nuovi, variabili env, righe in "Decisioni tecniche" (Octokit, cache in-memory vs Redis,
   cron in-process, PAT cifrato vs OAuth), TODO per OAuth App.

## Decisioni da confermare

- **PAT per utente** (proposto) vs OAuth GitHub subito: OAuth serve una OAuth App registrata da te.
- **REST v3** (proposto) vs GraphQL v4: REST più semplice da mockare; GraphQL valutabile se il rate limit diventa un problema.
- **Cache in-memory** (proposto) vs Redis: Redis aggiunge un servizio in CI e in deploy senza benefici per un'istanza singola.

## Come si verifica

`lint`, `typecheck`, `test`, `build` verdi in entrambi i package; con un PAT reale:
`PUT /api/me/github-token` → `POST /api/repos` → `POST /api/repos/:id/sync` → `GET /api/repos/:id/metrics` restituisce la serie.

## Fuori scope

Report AI (Fase 4), UI (Fase 5), webhook real-time (opzionale, dopo il deploy perché serve un URL pubblico), notifiche.

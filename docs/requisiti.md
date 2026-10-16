# Requisiti di SPEC.md: stato

Ogni voce di [`SPEC.md`](../SPEC.md) con il suo stato. Va aggiornata nella stessa PR che cambia lo stato di una voce.
Legenda: ✅ fatto · ⚠️ fatto in parte o con una deviazione motivata · ⏳ richiede account o chiavi del maintainer · ❌ non fatto

## 1. Autenticazione e utenti

| Requisito                                    | Stato | Dove / note                                                             |
| -------------------------------------------- | ----- | ----------------------------------------------------------------------- |
| Login e registrazione email + password (JWT) | ✅    | `backend/src/services/auth.service.ts`, `AuthPage`                      |
| OAuth GitHub (opzionale)                     | ❌    | Serve una GitHub OAuth App; oggi token personale cifrato (README, TODO) |
| Password reset via email                     | ⚠️    | Backend completo; mancano le pagine frontend (Roadmap)                  |
| Ruoli admin/user                             | ✅    | `requireRole`, `GET /api/users` solo ADMIN                              |
| Sessioni persistenti (refresh token)         | ✅    | Refresh token ruotati, hash in DB, revoca per family                    |

## 2. Integrazione GitHub

| Requisito                       | Stato | Dove / note                                                       |
| ------------------------------- | ----- | ----------------------------------------------------------------- |
| GitHub API v3/v4                | ⚠️    | Solo REST v3 con Octokit (decisione nel README)                   |
| Repository, issue, PR, stato CI | ✅    | `services/github/`, `services/sync/`                              |
| Code quality (se disponibile)   | ❌    | Non integrato (es. code scanning): Roadmap                        |
| Webhook real-time (opzionale)   | ❌    | Serve un URL pubblico; sync periodico al suo posto                |
| Rate limiting e caching         | ✅    | Cache ETag in memoria, retry sul rate limit, `express-rate-limit` |

## 3. Report AI

| Requisito                                  | Stato | Dove / note                                         |
| ------------------------------------------ | ----- | --------------------------------------------------- |
| Riassunto settimanale, tech debt, priorità | ✅    | `services/reports/` con output strutturato validato |
| Storico nel DB                             | ✅    | Tabella `Report`, `GET /api/reports`                |
| Export PDF e Markdown                      | ✅    | `GET /api/reports/:id/export`                       |

## 3b. Provider AI multipli

| Requisito                                | Stato | Dove / note                                            |
| ---------------------------------------- | ----- | ------------------------------------------------------ |
| Un solo modulo AI                        | ✅    | `backend/src/services/ai/`                             |
| Catalogo models.dev con copia di riserva | ✅    | Snapshot `@opencode-ai/models`                         |
| Chiave del server come default           | ✅    | `AI_PROVIDER`, `AI_MODEL`, `AI_API_KEY`                |
| Chiave per utente verificata e cifrata   | ✅    | Pagina AI settings, AES-256-GCM                        |
| Prova con una chiave reale               | ⏳    | Nessuna chiave in sviluppo: test con risposte simulate |

## 4. Dashboard frontend

| Requisito                       | Stato | Dove / note                                         |
| ------------------------------- | ----- | --------------------------------------------------- |
| Overview con metriche chiave    | ✅    | `DashboardPage`                                     |
| Repository: lista e dettaglio   | ✅    | `ReposPage`, `RepoDetailPage`                       |
| Report: storico e generazione   | ✅    | `ReportsPage`, `ReportDetailPage`                   |
| Grafici issue, PR, pass rate CI | ✅    | `components/charts/`                                |
| Filtri data, repository, stato  | ✅    | Query param; stato del sync nella pagina repository |
| Dark mode                       | ✅    | Classe `.dark`, scelta salvata                      |

## 5. Backend

| Requisito                                                       | Stato | Dove / note                                        |
| --------------------------------------------------------------- | ----- | -------------------------------------------------- |
| REST `/api/auth`, `/api/repos`, `/api/reports`                  | ✅    | Più `/api/ai`, `/api/notifications`, `/api/github` |
| Zod, errori centralizzati, Pino, rate limit, CORS, health check | ✅    | `middleware/`, `config/env.ts`                     |

## 6. Database

| Requisito                                 | Stato | Dove / note                            |
| ----------------------------------------- | ----- | -------------------------------------- |
| Modelli User, Repository, Report, Metrics | ✅    | `backend/prisma/schema.prisma`         |
| Migrazioni e seed demo                    | ✅    | `prisma/migrations/`, `prisma/seed.ts` |

## 7. Notifiche

| Requisito                                | Stato | Dove / note                                                                                                     |
| ---------------------------------------- | ----- | --------------------------------------------------------------------------------------------------------------- |
| Bot Telegram: report settimanale e alert | ⚠️    | Fatto con un client Bot API proprio invece di `node-telegram-bot-api` (webhook, niente polling); token reale ⏳ |
| Email settimanale (Resend)               | ✅    | Chiave reale ⏳                                                                                                 |
| Preferenze utente                        | ✅    | Pagina Notifications, giorno, ora e fuso                                                                        |

## 8. CI/CD e deploy

| Requisito                                  | Stato | Dove / note                                                     |
| ------------------------------------------ | ----- | --------------------------------------------------------------- |
| Test, lint e typecheck su ogni push        | ✅    | `.github/workflows/ci.yml` (`npm run check`)                    |
| Build e deploy automatico Vercel + Railway | ⏳    | `deploy.yml` pronto; servono account e segreti (README, Deploy) |
| `.env.example`                             | ✅    | In `backend/` e `frontend/`                                     |
| Dockerfile                                 | ✅    | Verificato in CI (job `docker`)                                 |

## 9. Test

| Requisito                                          | Stato | Dove / note                    |
| -------------------------------------------------- | ----- | ------------------------------ |
| Jest: auth, report, GitHub con mock                | ✅    | Integrazione su Postgres reale |
| Playwright: login, navigazione, generazione report | ✅    | `frontend/e2e/`                |

## 10. README

| Requisito                                                                | Stato | Dove / note          |
| ------------------------------------------------------------------------ | ----- | -------------------- |
| Screenshot                                                               | ✅    | `docs/screenshots/`  |
| Link alla demo live                                                      | ⏳    | Dopo il primo deploy |
| Stack, architettura Mermaid, setup, decisioni, trade-off, sfide, roadmap | ✅    | `README.md`          |

## Requisiti non funzionali

| Requisito                                     | Stato | Dove / note                                 |
| --------------------------------------------- | ----- | ------------------------------------------- |
| TypeScript strict, niente `any`               | ✅    | `tsconfig`, ESLint `no-explicit-any`        |
| ESLint + Prettier, Conventional Commits       | ✅    | `npm run lint`                              |
| Lighthouse > 90                               | ✅    | Misure nel README, sezione Prestazioni      |
| API < 300 ms di media                         | ✅    | Misure nel README                           |
| bcrypt, JWT con refresh, Prisma, verifica XSS | ✅    | Markdown dei report escapato, link filtrati |

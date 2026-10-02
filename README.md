# DevOps Dashboard

Dashboard full-stack che monitora repository GitHub e genera report intelligenti con AI.
Progetto dimostrativo sviluppato interamente con Claude Code. Specifica completa in [`SPEC.md`](SPEC.md).

> **Stato:** Fase 2 (auth) — registrazione/login JWT, refresh token con rotazione, ruoli, reset password. Integrazione GitHub, report AI, frontend completo e notifiche arrivano nelle fasi successive.

## Stack

| Layer    | Tecnologia                                             |
| -------- | ------------------------------------------------------ |
| Frontend | React 19, TypeScript 5.9, Vite 8, Tailwind CSS 4       |
| Backend  | Node.js 22, Express 5, TypeScript 5.9, Zod 4, Pino 10  |
| Database | PostgreSQL 16, Prisma 6                                |
| Test     | Jest 30 + Supertest (backend), Vitest (frontend, unit) |
| CI       | GitHub Actions                                         |

## Struttura

```
frontend/   React + Vite        src/{components,pages,hooks,lib,api}
backend/    Express + Prisma    src/{routes,controllers,services,middleware,lib,config}, prisma/
.github/workflows/ci.yml
```

## Setup locale

Prerequisiti: Node 22, npm, PostgreSQL 16 in locale (o `docker run -e POSTGRES_PASSWORD=dev -p 5432:5432 postgres:16`).

```bash
# 1. Backend
cd backend
npm install
cp .env.example .env          # imposta DATABASE_URL, TEST_DATABASE_URL e JWT_ACCESS_SECRET
npx prisma migrate dev        # applica le migrazioni e genera il client
DATABASE_URL=<TEST_DATABASE_URL> npx prisma migrate deploy   # prepara il DB dei test
npm run db:seed               # 2 utenti demo, 2 repository, 30 giorni di metriche
npm run dev                   # http://localhost:4000/api/health

# 2. Frontend (altro terminale)
cd frontend
npm install
npm run dev                   # http://localhost:5173 (proxy /api -> :4000)
```

In ogni package: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`.
I test backend sono di integrazione e **svuotano** il database indicato in `TEST_DATABASE_URL`: usa un DB dedicato.

Utenti demo creati dal seed (solo per sviluppo): `demo@example.com` (ADMIN) e `user@example.com` (USER), password `demo-password`.

## API

| Metodo | Path                        | Descrizione                                                                  |
| ------ | --------------------------- | ---------------------------------------------------------------------------- |
| GET    | `/api/health`               | Stato API e database. `200` se il DB risponde, `503` (`degraded`) altrimenti |
| POST   | `/api/auth/register`        | `{ email, password }` → `201 { user, accessToken }` + cookie refresh         |
| POST   | `/api/auth/login`           | `{ email, password }` → `200 { user, accessToken }` + cookie refresh         |
| POST   | `/api/auth/refresh`         | Usa il cookie `refresh_token`, lo ruota e restituisce un nuovo access token  |
| POST   | `/api/auth/logout`          | Revoca la sessione (family del refresh token) e cancella il cookie           |
| GET    | `/api/auth/me`              | Utente corrente (`Authorization: Bearer <accessToken>`)                      |
| POST   | `/api/auth/forgot-password` | `{ email }` → sempre `202`, invia il link se l'utente esiste                 |
| POST   | `/api/auth/reset-password`  | `{ token, password }` → `204`, revoca tutte le sessioni                      |
| GET    | `/api/users`                | Lista utenti, solo ruolo `ADMIN`                                             |

## Decisioni tecniche

- **PostgreSQL invece di MongoDB** — i dati sono fortemente relazionali (utente → repository → report/metriche) e le metriche giornaliere richiedono aggregazioni per intervallo di date, dove SQL e gli indici composti brillano. MongoDB scartato: avremmo riprodotto join e vincoli di unicità a livello applicativo.
- **Prisma invece di Drizzle/TypeORM** — schema dichiarativo unico, migrazioni generate e client completamente tipizzato senza decorator. Drizzle scartato: più vicino a SQL ma con migrazioni e tooling meno maturi; TypeORM scartato per tipizzazione debole e decorator.
- **Express invece di Fastify/Nest** — ecosistema di middleware più ampio (helmet, rate-limit, pino-http) e Express 5 gestisce nativamente le promise rifiutate. Fastify scartato: più veloce ma il collo di bottiglia qui sono GitHub e LLM, non il framework; Nest scartato: troppa cerimonia per un'API di queste dimensioni.
- **Prisma 6 invece di 7** — Prisma 7 richiede driver adapter e `prisma.config.ts`; per la fase base restiamo sulla linea stabile più diffusa, migrazione pianificata in seguito.
- **TypeScript 5.9 invece di 6** — ts-jest e typescript-eslint non dichiarano ancora il supporto a TS 6.
- **Probe del DB iniettabile in `createApp`** — permette di testare `/api/health` senza database reale. Alternativa scartata: mock globale del modulo Prisma, più fragile con ESM.
- **Vitest per i test unitari frontend** — condivide config e trasformazioni con Vite; Jest scartato lato frontend perché richiederebbe una pipeline di trasformazione separata. Playwright (E2E) arriverà in Fase 5.
- **Dark mode via classe `.dark`** — consente sia il default di sistema sia la scelta esplicita salvata in `localStorage`. Alternativa scartata: solo `prefers-color-scheme`, che non permette il toggle.
- **Access token JWT breve (15 min) + refresh token opaco in cookie httpOnly** — l'access token vive in memoria nel frontend, il refresh non è leggibile da JavaScript (mitiga XSS). Alternativa scartata: refresh JWT in `localStorage`, esposto a XSS e non revocabile.
- **Refresh token salvati come hash SHA-256, con rotazione e "family"** — un dump del DB non espone token utilizzabili; il riuso di un token già ruotato revoca l'intera sessione (rilevamento furto). SHA-256 invece di bcrypt perché i token sono casuali a 256 bit. Alternativa scartata: refresh JWT stateless, impossibile da revocare.
- **Cookie `SameSite=None; Secure` in produzione, `Lax` in sviluppo, `Path=/api/auth`** — frontend (Vercel) e API (Railway) sono su domini diversi; il path limita l'invio del cookie ai soli endpoint di auth.
- **bcryptjs invece di bcrypt nativo o argon2** — nessuna compilazione nativa in CI e su Railway; costo 12 round. Argon2 è più moderno ma richiede binding nativi. Password limitate a 72 byte (limite di bcrypt).
- **Risposte uniformi su login e forgot-password** — stesso errore per email inesistente o password errata, confronto con un hash fittizio per tempi simili, `202` sempre su forgot-password: niente user enumeration.
- **Test di integrazione su Postgres reale (`TEST_DATABASE_URL`)** — i flussi di auth dipendono da vincoli e transazioni del DB; un mock di Prisma avrebbe testato il mock. In CI il DB è un service container.
- **Email via interfaccia `EmailSender`** — Resend in produzione, sender finto nei test; senza `RESEND_API_KEY` non si invia nulla (in development il link finisce nei log).
- **`trust proxy` attivo in produzione** — dietro il proxy di Railway serve per far vedere al rate limiter l'IP reale del client.

## TODO

- Email: crea un account [Resend](https://resend.com), verifica un dominio e imposta `RESEND_API_KEY` e `EMAIL_FROM`. Senza chiave il reset password non invia email.
- OAuth GitHub (opzionale da spec): richiede una GitHub OAuth App (client id/secret) — non implementato in questa fase.
- Pulizia periodica dei refresh/reset token scaduti (job schedulato).

- Deploy (Fase 7): richiede account Railway (backend + Postgres) e Vercel (frontend) — da configurare dal maintainer.

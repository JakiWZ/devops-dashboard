# DevOps Dashboard

Dashboard full-stack che monitora repository GitHub e genera report intelligenti con AI.
Progetto dimostrativo sviluppato interamente con Claude Code. Specifica completa in [`SPEC.md`](SPEC.md).

> **Stato:** Fase 1 (base) — monorepo, tooling, schema DB, health check, CI. Auth, integrazione GitHub, report AI e notifiche arrivano nelle fasi successive.

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
cp .env.example .env          # imposta DATABASE_URL con le tue credenziali locali
npx prisma migrate dev        # applica le migrazioni e genera il client
npm run db:seed               # utente demo, 2 repository, 30 giorni di metriche
npm run dev                   # http://localhost:4000/api/health

# 2. Frontend (altro terminale)
cd frontend
npm install
npm run dev                   # http://localhost:5173 (proxy /api -> :4000)
```

In ogni package: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`.

## API

| Metodo | Path          | Descrizione                                                                  |
| ------ | ------------- | ---------------------------------------------------------------------------- |
| GET    | `/api/health` | Stato API e database. `200` se il DB risponde, `503` (`degraded`) altrimenti |

## Decisioni tecniche

- **PostgreSQL invece di MongoDB** — i dati sono fortemente relazionali (utente → repository → report/metriche) e le metriche giornaliere richiedono aggregazioni per intervallo di date, dove SQL e gli indici composti brillano. MongoDB scartato: avremmo riprodotto join e vincoli di unicità a livello applicativo.
- **Prisma invece di Drizzle/TypeORM** — schema dichiarativo unico, migrazioni generate e client completamente tipizzato senza decorator. Drizzle scartato: più vicino a SQL ma con migrazioni e tooling meno maturi; TypeORM scartato per tipizzazione debole e decorator.
- **Express invece di Fastify/Nest** — ecosistema di middleware più ampio (helmet, rate-limit, pino-http) e Express 5 gestisce nativamente le promise rifiutate. Fastify scartato: più veloce ma il collo di bottiglia qui sono GitHub e LLM, non il framework; Nest scartato: troppa cerimonia per un'API di queste dimensioni.
- **Prisma 6 invece di 7** — Prisma 7 richiede driver adapter e `prisma.config.ts`; per la fase base restiamo sulla linea stabile più diffusa, migrazione pianificata in seguito.
- **TypeScript 5.9 invece di 6** — ts-jest e typescript-eslint non dichiarano ancora il supporto a TS 6.
- **Probe del DB iniettabile in `createApp`** — permette di testare `/api/health` senza database reale. Alternativa scartata: mock globale del modulo Prisma, più fragile con ESM.
- **Vitest per i test unitari frontend** — condivide config e trasformazioni con Vite; Jest scartato lato frontend perché richiederebbe una pipeline di trasformazione separata. Playwright (E2E) arriverà in Fase 5.
- **Dark mode via classe `.dark`** — consente sia il default di sistema sia la scelta esplicita salvata in `localStorage`. Alternativa scartata: solo `prefers-color-scheme`, che non permette il toggle.
- **Seed con password placeholder** — l'utente demo ha un hash non valido finché l'hashing bcrypt non arriva in Fase 2, per non introdurre logica di auth in anticipo.

## TODO

- Deploy (Fase 7): richiede account Railway (backend + Postgres) e Vercel (frontend) — da configurare dal maintainer.

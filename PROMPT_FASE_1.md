Leggi `SPEC.md` e `CLAUDE.md`. Esegui SOLO la **Fase 1: Base** su un branch `feat/fase-1-base`.

Cosa fare:
1. Monorepo con `frontend/` (React 19 + Vite + TypeScript + Tailwind) e `backend/` (Node 22 + Express + TypeScript), ciascuno con il proprio `package.json`.
2. TypeScript `strict` in entrambi, ESLint + Prettier configurati, script `lint`, `typecheck`, `test`, `build`, `dev`.
3. Backend: Express con middleware base (CORS, helmet, rate limit, Pino, error handler centrale), endpoint `GET /api/health`, validazione env con Zod, `.env.example`.
4. Prisma + PostgreSQL: schema con User, Repository, Report, Metrics come in SPEC.md, prima migrazione, seed script con dati demo.
5. Test Jest minimo sul backend (health check e error handler).
6. Frontend: pagina placeholder che chiama `/api/health` e mostra lo stato; dark mode predisposta.
7. GitHub Actions (`.github/workflows/ci.yml`): su push e PR esegue install, lint, typecheck, test, build per frontend e backend (Postgres come service container).
8. `README.md` iniziale: descrizione, stack, setup locale step-by-step, sezione "Decisioni tecniche" con PostgreSQL vs MongoDB, Prisma vs Drizzle/TypeORM, Express vs Fastify/Nest.

Vincoli: nessuna feature di fasi successive (auth, GitHub, AI, notifiche). Nessun segreto nel repo. Prima di chiudere esegui lint, typecheck, test e build e riporta l'output reale. Apri una PR con riepilogo e istruzioni di verifica.

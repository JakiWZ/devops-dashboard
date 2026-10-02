# CLAUDE.md

Progetto: AI-Powered DevOps Dashboard. Specifica completa in `SPEC.md` (leggila sempre prima di iniziare).

## Come lavorare
- Procedi **a fasi** (vedi "Fasi di sviluppo" in SPEC.md). Fai solo la fase richiesta, non anticipare le successive.
- Una fase = un branch `feat/fase-N-nome` = una PR con descrizione di cosa è stato fatto e come verificarlo.
- Prima di dichiarare finito: `lint`, `typecheck` e `test` devono passare. Riporta l'output reale, anche se fallisce.
- Non inventare credenziali. Usa `.env.example` con placeholder; i segreti reali non vanno mai nel repo.
- Se un servizio esterno richiede un account o una chiave (Railway, Vercel, Resend, Telegram, GitHub OAuth), lascia un TODO chiaro nel README invece di simularlo.

## Convenzioni
- TypeScript strict, vietato `any`.
- ESLint + Prettier; `npm run lint`, `npm run typecheck`, `npm test` in ogni package.
- Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`, `test:`).
- Validazione input con Zod, logging con Pino, errori gestiti da un middleware centrale.
- Test accanto al codice che coprono la logica non banale; niente suite per ogni funzione.

## Stack
Frontend: React 19, Vite, Tailwind, Recharts. Backend: Node 22, Express. DB: PostgreSQL + Prisma. Test: Jest, Playwright.

## Decisioni da documentare
Quando fai una scelta tecnica non ovvia, aggiungi una riga in `README.md` sezione "Decisioni tecniche" (cosa, perché, alternativa scartata).

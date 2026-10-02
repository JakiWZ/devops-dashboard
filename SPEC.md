# AI-Powered DevOps Dashboard — Specifica

Dashboard full-stack che monitora repository GitHub e genera report intelligenti con AI.
Progetto dimostrativo da senior engineer, sviluppato interamente con Claude Code.

## Stack

| Layer | Tecnologia |
|-------|------------|
| Frontend | React 19, TypeScript, Vite, TailwindCSS, Recharts |
| Backend | Node.js 22, Express, TypeScript |
| Database | PostgreSQL (Supabase o Railway) |
| ORM | Prisma |
| Auth | JWT + bcrypt |
| AI | Qualunque provider del catalogo models.dev via Vercel AI SDK (chiave del server come default, chiave per utente opzionale) |
| Email | Resend |
| Telegram | node-telegram-bot-api |
| Deploy | Vercel (frontend), Railway (backend) |
| CI/CD | GitHub Actions |
| Testing | Jest (backend), Playwright (frontend) |

## Requisiti funzionali

### 1. Autenticazione & utenti
- Login/registrazione email + password (JWT)
- OAuth GitHub (opzionale, preferito)
- Password reset via email
- Ruoli: admin/user
- Sessioni persistenti (refresh token)

### 2. Integrazione GitHub
- GitHub API v3/v4
- Fetch: repository, issue, PR, CI status, code quality (se disponibile)
- Webhook per aggiornamenti real-time (opzionale)
- Rate limiting e caching (Redis o in-memory)

### 3. AI Report Generator
- Endpoint che chiama l'LLM per generare:
  - Riassunto settimanale attività repo
  - Identificazione tech debt (issue aperte da molto, PR bloccate)
  - Suggerimenti prioritari
- Report salvati nel DB con storico
- Export PDF/Markdown

### 3b. Provider AI multipli (vale per ogni funzione AI del progetto)
- Un solo modulo AI nel backend: ogni funzione AI (report, report schedulati, riassunti nelle notifiche, funzioni future) passa da lì; nessun altro file usa direttamente l'SDK di un provider
- Catalogo di provider e modelli da models.dev (lo stesso di OpenCode), con copia locale di riserva
- Chiave del server come default (`AI_PROVIDER`, `AI_MODEL`, `AI_API_KEY`)
- Chiave per utente opzionale: scelgo il provider dalla lista, incollo la chiave, la dashboard la verifica; se funziona scelgo il modello tra quelli del provider, altrimenti la reinserisco o torno indietro. Chiave cifrata nel DB, mai restituita al client

### 4. Dashboard frontend (React + TypeScript)
- Homepage con overview (metriche chiave)
- Pagina repository (lista + dettagli)
- Pagina report (storico + genera nuovo)
- Grafici (Recharts): issue aperte/chiuse nel tempo, PR merged vs open, CI pass/fail rate
- Filtri (data range, repository, stato)
- Dark mode

### 5. Backend (Node.js + Express + TypeScript)
- REST API: `/api/auth`, `/api/repos`, `/api/reports`
- Validazione input (Zod)
- Error handling centralizzato
- Logging (Pino)
- Rate limiting (express-rate-limit)
- CORS configurato correttamente
- Health check `/api/health`

### 6. Database (PostgreSQL + Prisma)
- User (id, email, passwordHash, role, createdAt)
- Repository (id, userId, githubId, name, url, lastSyncedAt)
- Report (id, repositoryId, content, summary, generatedAt)
- Metrics (id, repositoryId, date, openIssues, closedIssues, openPRs, mergedPRs, ciPassRate)
- Migrazioni Prisma
- Seed script per dati demo

### 7. Notifiche (Telegram + Email)
- Bot Telegram: report settimanale automatico, alert su PR bloccate o CI falliti
- Email settimanale (Resend)
- Preferenze utente (cosa ricevere, quando)

### 8. CI/CD & deployment
- GitHub Actions: test su ogni push, lint + type check, build e deploy automatico (Vercel + Railway)
- Variabili d'ambiente gestite correttamente (`.env.example` incluso)
- Dockerfile opzionale

### 9. Testing
- Jest backend: auth endpoints, logica report, integrazione GitHub (mock)
- Playwright frontend: login flow, navigazione dashboard, generazione report

### 10. Documentazione (README da senior)
- Titolo, screenshot/demo GIF, link live demo
- Tech stack con versioni
- Architettura (Mermaid)
- Setup locale step-by-step
- Decisioni tecniche motivate: PostgreSQL vs MongoDB, Prisma vs Drizzle/TypeORM, Express vs Fastify/Nest
- Trade-off e cosa migliorare con più tempo
- Challenge affrontati e soluzioni
- Roadmap futura

## Requisiti non funzionali
- TypeScript strict, niente `any`
- ESLint + Prettier
- Conventional Commits
- Struttura cartelle chiara e scalabile
- Performance: Lighthouse > 90, risposta API media < 300ms
- Sicurezza: bcrypt/argon2, JWT con scadenza + refresh, protezione SQL injection (Prisma), verifica XSS

## Struttura cartelle

```
/
├── frontend/          # React + Vite
│   └── src/{components,pages,hooks,lib,api}
├── backend/           # Express + Prisma
│   ├── prisma/        # schema, migrazioni, seed
│   └── src/{routes,controllers,services,middleware,lib,config}
├── .github/workflows/
├── SPEC.md
├── CLAUDE.md
└── README.md
```

## Fasi di sviluppo

1. **Base:** monorepo, TS strict, lint, schema Prisma, health check, CI
2. **Auth:** JWT, refresh, ruoli, reset password, test
3. **GitHub e metriche:** integrazione API, cache, sync, seed demo
4. **Report AI:** provider AI a scelta (vedi 3b), storico, export
5. **Frontend:** dashboard, grafici, filtri, dark mode, test Playwright
6. **Notifiche:** Telegram, email, preferenze
7. **Deploy e README**

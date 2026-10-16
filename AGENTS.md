# AGENTS.md

Istruzioni per agenti di sviluppo (Claude Code, Codex, Cursor e simili). Le regole complete sono in [`CLAUDE.md`](CLAUDE.md), la specifica in [`SPEC.md`](SPEC.md): leggile prima di iniziare.

## In breve

- Comando unico di verifica, dalla radice: `npm run check` (lint, typecheck, test e build di backend e frontend). Deve passare prima di dichiarare finito; riporta l'output reale.
- I test backend richiedono Postgres e `TEST_DATABASE_URL` (un database che viene svuotato). E2E: `npm run test:e2e`.
- Stato dei requisiti: [`docs/requisiti.md`](docs/requisiti.md). Aggiornalo quando cambi lo stato di una voce.
- Piani delle parti grandi: [`docs/piani/`](docs/piani/). Per una modifica grande, scrivi prima un piano lì.
- Per ispezionare dati e comportamento senza browser: il server MCP in `backend/src/mcp/` (README, "Agenti e MCP"), in sola lettura salvo `MCP_ALLOW_WRITES=true`.
- Niente credenziali nel repo; servizi che richiedono un account restano TODO nel README.

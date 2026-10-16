import { config } from 'dotenv';

// Su stdio lo stdout è il canale del protocollo MCP: i log devono andare su stderr.
// Va impostato prima che logger e configurazione vengano importati, quindi l'import è dinamico.
process.env.LOG_STDERR = 'true';
// Il client MCP avvia il processo dalla sua cartella, non da backend/: carichiamo backend/.env
// in modo esplicito (vale sia per src/mcp sia per dist/mcp).
config({ path: new URL('../../.env', import.meta.url), quiet: true });
await import('./server.js');

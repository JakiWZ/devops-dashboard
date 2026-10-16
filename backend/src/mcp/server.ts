import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServices } from '../app.js';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';
import { prisma } from '../lib/prisma.js';
import { createOctokitClientFactory } from '../services/github/octokit.client.js';
import { prismaProbe } from '../services/health.service.js';
import { registerTools } from './tools.js';

// Server MCP su stdio: nessuna porta di rete, lo avvia il client MCP come processo figlio.
// Agisce per un solo utente (MCP_USER_EMAIL) ed è in sola lettura finché MCP_ALLOW_WRITES non è true.
async function main(): Promise<void> {
  if (!env.MCP_USER_EMAIL) throw new Error('MCP_USER_EMAIL is required');
  const user = await prisma.user.findUnique({ where: { email: env.MCP_USER_EMAIL } });
  if (!user) throw new Error(`No user with email ${env.MCP_USER_EMAIL}`);

  const server = new McpServer({ name: 'devops-dashboard', version: '0.1.0' });
  registerTools(server, {
    services: createServices({ githubClientFactory: createOctokitClientFactory() }),
    probe: prismaProbe,
    userId: user.id,
    allowWrites: env.MCP_ALLOW_WRITES,
  });
  await server.connect(new StdioServerTransport());
  logger.info({ allowWrites: env.MCP_ALLOW_WRITES }, 'MCP server ready on stdio');
}

main().catch((err: unknown) => {
  logger.error({ err }, 'MCP server failed to start');
  void prisma.$disconnect().finally(() => process.exit(1));
});

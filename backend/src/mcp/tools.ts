import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import type { AppServices } from '../app.js';
import { HttpError } from '../lib/http-error.js';
import { MAX_METRICS_RANGE_DAYS } from '../routes/repos.schemas.js';
import { getHealth, type DatabaseProbe } from '../services/health.service.js';

export interface McpContext {
  services: AppServices;
  probe: DatabaseProbe;
  /** L'unico utente per cui il server agisce: tutti i tool vedono solo i suoi dati. */
  userId: string;
  /** Senza questo flag il server è in sola lettura: sync, generazione e invii non esistono. */
  allowWrites: boolean;
}

export const READ_TOOLS = [
  'health',
  'repos_list',
  'repo_get',
  'repo_metrics',
  'reports_list',
  'report_get',
  'ai_settings',
  'notification_settings',
] as const;
export const WRITE_TOOLS = ['repo_sync', 'report_generate', 'notification_test'] as const;

const isoDate = z.iso.date().transform((value) => new Date(`${value}T00:00:00.000Z`));
const id = z.string().min(1).max(64);

function ok(value: unknown): CallToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] };
}

/** Gli errori dei servizi diventano risultati con isError, come le risposte 4xx/5xx dell'API. */
async function run(action: () => Promise<unknown>): Promise<CallToolResult> {
  try {
    return ok(await action());
  } catch (err) {
    if (err instanceof HttpError) {
      return {
        isError: true,
        content: [{ type: 'text', text: JSON.stringify({ code: err.code, message: err.message }) }],
      };
    }
    throw err;
  }
}

/**
 * Registra i tool sullo stesso motore dell'API (i servizi di createServices): un agente può
 * ispezionare i dati e, se abilitato, far girare sync e report senza browser né HTTP.
 * Non ci sono tool su file, token, chiavi o altri utenti.
 */
export function registerTools(server: McpServer, ctx: McpContext): void {
  const { services, userId } = ctx;
  const readOnly = { readOnlyHint: true, openWorldHint: false };

  server.registerTool(
    'health',
    { description: 'API process uptime and database status.', annotations: readOnly },
    () => run(() => getHealth(ctx.probe)),
  );

  server.registerTool(
    'repos_list',
    {
      description: 'Tracked repositories with sync status and latest daily metrics.',
      annotations: readOnly,
    },
    () => run(() => services.github.repos.list(userId)),
  );

  server.registerTool(
    'repo_get',
    {
      description: 'One tracked repository by id.',
      inputSchema: { repositoryId: id },
      annotations: readOnly,
    },
    ({ repositoryId }) => run(() => services.github.repos.get(userId, repositoryId)),
  );

  server.registerTool(
    'repo_metrics',
    {
      description: `Daily metrics (UTC) of a repository. Dates are YYYY-MM-DD; default last 30 days, max ${MAX_METRICS_RANGE_DAYS}.`,
      inputSchema: { repositoryId: id, from: isoDate.optional(), to: isoDate.optional() },
      annotations: readOnly,
    },
    ({ repositoryId, from, to }) =>
      run(() =>
        services.github.repos.metrics(userId, repositoryId, { from, to }, MAX_METRICS_RANGE_DAYS),
      ),
  );

  server.registerTool(
    'reports_list',
    {
      description: 'AI report history, newest first, without the full content.',
      inputSchema: {
        repositoryId: id.optional(),
        limit: z.number().int().min(1).max(100).default(20),
        offset: z.number().int().min(0).default(0),
      },
      annotations: readOnly,
    },
    ({ repositoryId, limit, offset }) =>
      run(() => services.reports.list(userId, { repositoryId, limit, offset })),
  );

  server.registerTool(
    'report_get',
    {
      description: 'One report with its Markdown content and structured data.',
      inputSchema: { reportId: id },
      annotations: readOnly,
    },
    ({ reportId }) => run(() => services.reports.get(userId, reportId)),
  );

  server.registerTool(
    'ai_settings',
    {
      description: 'Which AI provider and model reports use. Keys are never returned.',
      annotations: readOnly,
    },
    () => run(() => services.aiSettings.settings(userId)),
  );

  server.registerTool(
    'notification_settings',
    { description: 'Notification preferences and channel status.', annotations: readOnly },
    () => run(() => services.notifications.settings(userId)),
  );

  if (!ctx.allowWrites) return;

  const write = { readOnlyHint: false, destructiveHint: false, openWorldHint: true };

  server.registerTool(
    'repo_sync',
    {
      description: 'Sync a repository from GitHub now (needs a connected GitHub token).',
      inputSchema: { repositoryId: id },
      annotations: write,
    },
    ({ repositoryId }) =>
      run(async () => {
        // Come nell'API: prima l'ownership, poi il sync.
        const repo = await services.github.repos.get(userId, repositoryId);
        return services.github.sync.sync(repo.id);
      }),
  );

  server.registerTool(
    'report_generate',
    {
      description: 'Generate a new AI report for a repository (calls the AI provider, 30-90 s).',
      inputSchema: { repositoryId: id },
      annotations: write,
    },
    ({ repositoryId }) => run(() => services.reports.generate(userId, repositoryId)),
  );

  server.registerTool(
    'notification_test',
    {
      description: 'Send a test notification on the enabled channels.',
      annotations: write,
    },
    () => run(async () => ({ delivered: await services.notifications.sendTest(userId) })),
  );
}

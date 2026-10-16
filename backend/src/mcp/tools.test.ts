import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createServices } from '../app.js';
import { prisma } from '../lib/prisma.js';
import type { ReportGenerator } from '../services/reports/report-generator.js';
import { FakeEmailSender, FakeGitHubClient, resetDatabase } from '../test/helpers.js';
import { READ_TOOLS, registerTools, WRITE_TOOLS } from './tools.js';

const generator: ReportGenerator = {
  generate: async () => ({
    draft: {
      summary: 'Quiet week.',
      weeklyActivity: 'Nothing merged.',
      highlights: [],
      techDebt: [],
      priorities: [],
    },
    provider: 'anthropic',
    model: 'claude-opus-5-5',
    inputTokens: 10,
    outputTokens: 10,
  }),
};

async function connect(userId: string, allowWrites: boolean): Promise<Client> {
  const server = new McpServer({ name: 'test', version: '0.0.0' });
  registerTools(server, {
    services: createServices({
      emailSender: new FakeEmailSender(),
      githubClientFactory: () => new FakeGitHubClient(),
      reportGenerator: generator,
      telegram: null,
    }),
    probe: async () => undefined,
    userId,
    allowWrites,
  });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await server.connect(serverSide);
  const client = new Client({ name: 'test-client', version: '0.0.0' });
  await client.connect(clientSide);
  return client;
}

function textOf(result: Awaited<ReturnType<Client['callTool']>>): unknown {
  const content = Array.isArray(result.content) ? result.content : [];
  const first: unknown = content[0];
  if (typeof first !== 'object' || first === null || !('text' in first)) return null;
  return typeof first.text === 'string' ? JSON.parse(first.text) : null;
}

describe('MCP tools', () => {
  let ownerId: string;
  let ownRepoId: string;
  let otherRepoId: string;

  beforeEach(async () => {
    await resetDatabase();
    const owner = await prisma.user.create({
      data: { email: 'me@example.com', passwordHash: 'x' },
    });
    const other = await prisma.user.create({
      data: { email: 'other@example.com', passwordHash: 'x' },
    });
    ownerId = owner.id;
    const own = await prisma.repository.create({
      data: { userId: owner.id, githubId: 1, name: 'acme/api', url: 'https://github.com/acme/api' },
    });
    const foreign = await prisma.repository.create({
      data: { userId: other.id, githubId: 2, name: 'evil/x', url: 'https://github.com/evil/x' },
    });
    ownRepoId = own.id;
    otherRepoId = foreign.id;
    await prisma.metrics.create({
      data: {
        repositoryId: own.id,
        date: new Date('2026-10-01T00:00:00.000Z'),
        openIssues: 4,
        closedIssues: 1,
        openPRs: 2,
        mergedPRs: 1,
        ciPassRate: 0.9,
      },
    });
  });

  it('is read-only unless writes are enabled', async () => {
    const readOnly = await connect(ownerId, false);
    const names = (await readOnly.listTools()).tools.map((t) => t.name).sort();
    expect(names).toEqual([...READ_TOOLS].sort());

    const writable = await connect(ownerId, true);
    const all = (await writable.listTools()).tools.map((t) => t.name).sort();
    expect(all).toEqual([...READ_TOOLS, ...WRITE_TOOLS].sort());
  });

  it("returns only the configured user's data", async () => {
    const client = await connect(ownerId, false);
    const repos = textOf(await client.callTool({ name: 'repos_list', arguments: {} }));
    expect(repos).toEqual([expect.objectContaining({ id: ownRepoId, name: 'acme/api' })]);

    const foreign = await client.callTool({
      name: 'repo_get',
      arguments: { repositoryId: otherRepoId },
    });
    expect(foreign.isError).toBe(true);
    expect(textOf(foreign)).toEqual(expect.objectContaining({ code: 'NOT_FOUND' }));
  });

  it('reads metrics for a date range', async () => {
    const client = await connect(ownerId, false);
    const result = textOf(
      await client.callTool({
        name: 'repo_metrics',
        arguments: { repositoryId: ownRepoId, from: '2026-09-25', to: '2026-10-02' },
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({ metrics: [expect.objectContaining({ openIssues: 4 })] }),
    );
  });

  it('rejects invalid arguments', async () => {
    const client = await connect(ownerId, false);
    const result = await client.callTool({
      name: 'repo_metrics',
      arguments: { repositoryId: ownRepoId, from: 'yesterday' },
    });
    expect(result.isError).toBe(true);
  });

  it('generates a report when writes are enabled', async () => {
    const client = await connect(ownerId, true);
    const created = textOf(
      await client.callTool({ name: 'report_generate', arguments: { repositoryId: ownRepoId } }),
    );
    expect(created).toEqual(expect.objectContaining({ summary: 'Quiet week.' }));
    const list = textOf(await client.callTool({ name: 'reports_list', arguments: {} }));
    expect(list).toEqual(expect.objectContaining({ total: 1 }));
  });
});

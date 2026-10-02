import type { Express } from 'express';
import request from 'supertest';
import { createApp } from '../app.js';
import { HttpError } from '../lib/http-error.js';
import { prisma } from '../lib/prisma.js';
import type { ReportDraft } from '../services/reports/report-draft.js';
import type { GeneratedDraft, ReportGenerator } from '../services/reports/report-generator.js';
import type { ReportInput } from '../services/reports/report-input.js';
import { FakeEmailSender, FakeGitHubClient, issueFixture, resetDatabase } from '../test/helpers.js';

const DAY = 24 * 60 * 60 * 1000;
const STALE_URL = 'https://github.com/acme/web/issues/7';

const draft: ReportDraft = {
  summary: 'Backlog is growing.',
  weeklyActivity: 'Two PRs merged.',
  highlights: ['CI stable'],
  techDebt: [
    {
      title: 'Issue #7 open for 90 days',
      category: 'stale_issue',
      severity: 'high',
      evidence: 'Opened 90 days ago, no activity.',
      references: [STALE_URL, 'https://made-up.example/x'],
    },
  ],
  priorities: [{ title: 'Close #7', rationale: 'Oldest open issue.', effort: 'small' }],
};

class FakeReportGenerator implements ReportGenerator {
  inputs: ReportInput[] = [];
  fail: Error | null = null;
  delayMs = 0;

  async generate(input: ReportInput): Promise<GeneratedDraft> {
    this.inputs.push(input);
    if (this.delayMs) await new Promise((resolve) => setTimeout(resolve, this.delayMs));
    if (this.fail) throw this.fail;
    return { draft, model: 'claude-opus-5-5', inputTokens: 1000, outputTokens: 200 };
  }
}

let generator: FakeReportGenerator;
let github: FakeGitHubClient;

function buildApp(reportGenerator: ReportGenerator | null = generator): Express {
  return createApp({
    databaseProbe: async () => undefined,
    emailSender: new FakeEmailSender(),
    githubClientFactory: () => github,
    reportGenerator,
  });
}

let app: Express;

beforeEach(async () => {
  await resetDatabase();
  generator = new FakeReportGenerator();
  github = new FakeGitHubClient();
  app = buildApp();
});

afterAll(() => prisma.$disconnect());

async function signUp(email = 'alice@example.com'): Promise<{ token: string; userId: string }> {
  const res = await request(app)
    .post('/api/auth/register')
    .send({ email, password: 'correct-horse-battery' });
  return { token: res.body.accessToken as string, userId: res.body.user.id as string };
}

async function createRepo(userId: string, name = 'acme/web'): Promise<string> {
  const repo = await prisma.repository.create({
    data: {
      userId,
      githubId: Math.floor(Math.random() * 1e6),
      name,
      url: `https://github.com/${name}`,
    },
  });
  return repo.id;
}

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

describe('POST /api/reports', () => {
  it('generates a report from synced metrics when GitHub is not connected', async () => {
    const { token, userId } = await signUp();
    const repositoryId = await createRepo(userId);
    await prisma.metrics.create({
      data: {
        repositoryId,
        date: new Date(new Date().setUTCHours(0, 0, 0, 0)),
        openIssues: 12,
        closedIssues: 3,
        openPRs: 4,
        mergedPRs: 2,
        ciPassRate: 0.75,
      },
    });

    const res = await request(app)
      .post('/api/reports')
      .set(auth(token))
      .send({ repositoryId })
      .expect(201);

    expect(generator.inputs[0]).toMatchObject({
      liveGitHubData: false,
      weekly: { openIssues: 12, issuesClosed: 3, prsMerged: 2, ciPassRate: 0.75 },
    });
    expect(res.body.report).toMatchObject({
      repositoryId,
      repositoryName: 'acme/web',
      summary: 'Backlog is growing.',
      model: 'claude-opus-5-5',
      inputTokens: 1000,
      outputTokens: 200,
      data: draft,
    });
    expect(res.body.report.content).toContain('# Weekly report: acme/web');
    expect(res.body.report.content).toContain('connect GitHub');
    expect(await prisma.report.count()).toBe(1);
  });

  it('uses live GitHub data and keeps only links found in it', async () => {
    const { token, userId } = await signUp();
    await request(app)
      .put('/api/github/token')
      .set(auth(token))
      .send({ token: 'ghp_valid' })
      .expect(200);
    const repositoryId = await createRepo(userId);
    github.open = [
      issueFixture({ number: 7, url: STALE_URL, createdAt: new Date(Date.now() - 90 * DAY) }),
    ];

    const res = await request(app)
      .post('/api/reports')
      .set(auth(token))
      .send({ repositoryId })
      .expect(201);

    expect(generator.inputs[0]?.liveGitHubData).toBe(true);
    expect(generator.inputs[0]?.staleIssues.items[0]).toMatchObject({ number: 7, ageDays: 90 });
    expect(res.body.report.content).toContain(`- <${STALE_URL}>`);
    expect(res.body.report.content).not.toContain('made-up.example');
  });

  it('returns 404 for a repository of another user and does not call the model', async () => {
    const other = await signUp('bob@example.com');
    const repositoryId = await createRepo(other.userId);
    const { token } = await signUp();

    await request(app).post('/api/reports').set(auth(token)).send({ repositoryId }).expect(404);
    expect(generator.inputs).toHaveLength(0);
  });

  it('returns 503 when no AI provider is configured', async () => {
    app = buildApp(null);
    const { token, userId } = await signUp();
    const repositoryId = await createRepo(userId);
    const res = await request(app).post('/api/reports').set(auth(token)).send({ repositoryId });
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('AI_NOT_CONFIGURED');
  });

  it('propagates model errors without saving a report', async () => {
    generator.fail = new HttpError(502, 'refused', 'AI_REFUSED');
    const { token, userId } = await signUp();
    const repositoryId = await createRepo(userId);
    const res = await request(app).post('/api/reports').set(auth(token)).send({ repositoryId });
    expect(res.status).toBe(502);
    expect(await prisma.report.count()).toBe(0);
  });

  it('rejects a second generation for the same repository while one is running', async () => {
    generator.delayMs = 200;
    const { token, userId } = await signUp();
    const repositoryId = await createRepo(userId);
    const send = () => request(app).post('/api/reports').set(auth(token)).send({ repositoryId });

    const [first, second] = await Promise.all([send(), send()]);
    expect([first.status, second.status].sort()).toEqual([201, 409]);
  });

  it('validates the body', async () => {
    const { token } = await signUp();
    await request(app).post('/api/reports').set(auth(token)).send({}).expect(400);
  });
});

describe('report history', () => {
  async function seedReports(userId: string) {
    const web = await createRepo(userId, 'acme/web');
    const api = await createRepo(userId, 'acme/api');
    const base = { content: '# r\n\n- item', summary: 's' };
    await prisma.report.createMany({
      data: [
        { ...base, repositoryId: web, generatedAt: new Date('2026-09-01T10:00:00Z') },
        { ...base, repositoryId: web, generatedAt: new Date('2026-09-15T10:00:00Z') },
        { ...base, repositoryId: api, generatedAt: new Date('2026-09-20T10:00:00Z') },
      ],
    });
    return { web, api };
  }

  it('lists reports newest first with filters and pagination', async () => {
    const { token, userId } = await signUp();
    const { web } = await seedReports(userId);
    const other = await signUp('bob@example.com');
    await seedReports(other.userId);

    const all = await request(app).get('/api/reports').set(auth(token)).expect(200);
    expect(all.body.total).toBe(3);
    expect(all.body.reports.map((r: { repositoryName: string }) => r.repositoryName)).toEqual([
      'acme/api',
      'acme/web',
      'acme/web',
    ]);
    expect(all.body.reports[0]).not.toHaveProperty('content');

    const filtered = await request(app)
      .get('/api/reports')
      .query({ repositoryId: web, from: '2026-09-10', to: '2026-09-30' })
      .set(auth(token))
      .expect(200);
    expect(filtered.body.total).toBe(1);

    const page = await request(app)
      .get('/api/reports')
      .query({ limit: 1, offset: 1 })
      .set(auth(token))
      .expect(200);
    expect(page.body.reports).toHaveLength(1);
    expect(page.body.total).toBe(3);
  });

  it('rejects an inverted date range', async () => {
    const { token } = await signUp();
    await request(app)
      .get('/api/reports')
      .query({ from: '2026-09-30', to: '2026-09-01' })
      .set(auth(token))
      .expect(400);
  });

  it('hides, exports and deletes only own reports', async () => {
    const { token, userId } = await signUp();
    await seedReports(userId);
    const other = await signUp('bob@example.com');
    const { api: otherRepo } = await seedReports(other.userId);
    const mine = await prisma.report.findFirstOrThrow({ where: { repository: { userId } } });
    const theirs = await prisma.report.findFirstOrThrow({ where: { repositoryId: otherRepo } });

    await request(app).get(`/api/reports/${theirs.id}`).set(auth(token)).expect(404);
    await request(app).get(`/api/reports/${theirs.id}/export`).set(auth(token)).expect(404);
    await request(app).delete(`/api/reports/${theirs.id}`).set(auth(token)).expect(404);

    const md = await request(app)
      .get(`/api/reports/${mine.id}/export`)
      .set(auth(token))
      .expect(200);
    expect(md.headers['content-type']).toMatch(/text\/markdown/);
    expect(md.headers['content-disposition']).toMatch(/attachment; filename="report-acme-/);
    expect(md.text).toBe('# r\n\n- item');

    const pdf = await request(app)
      .get(`/api/reports/${mine.id}/export`)
      .query({ format: 'pdf' })
      .set(auth(token))
      .buffer(true)
      .parse((res, callback) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => callback(null, Buffer.concat(chunks)));
      })
      .expect(200);
    expect(pdf.headers['content-type']).toBe('application/pdf');
    expect((pdf.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');

    await request(app).delete(`/api/reports/${mine.id}`).set(auth(token)).expect(204);
    await request(app).get(`/api/reports/${mine.id}`).set(auth(token)).expect(404);
  });

  it('requires authentication', async () => {
    await request(app).get('/api/reports').expect(401);
  });
});

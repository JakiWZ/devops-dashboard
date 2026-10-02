import type { Express } from 'express';
import request from 'supertest';
import { createApp } from '../app.js';
import { prisma } from '../lib/prisma.js';
import type { ReportGenerator } from '../services/reports/report-generator.js';
import {
  FakeEmailSender,
  FakeGitHubClient,
  FakeReportGenerator,
  makeIssue,
  resetDatabase,
} from '../test/helpers.js';

const GITHUB_TOKEN = 'ghp_valid';
const DAY_MS = 24 * 60 * 60 * 1000;
let githubId = 0;

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

beforeEach(async () => {
  await resetDatabase();
  generator = new FakeReportGenerator();
  github = new FakeGitHubClient();
});

afterAll(() => prisma.$disconnect());

async function signUp(app: Express, email: string): Promise<string> {
  const res = await request(app)
    .post('/api/auth/register')
    .send({ email, password: 'correct-horse-battery' });
  return res.body.accessToken as string;
}

async function repoFor(email: string, name = 'acme/web'): Promise<string> {
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  const repo = await prisma.repository.create({
    data: {
      userId: user.id,
      githubId: ++githubId,
      name,
      url: `https://github.com/${name}`,
    },
  });
  return repo.id;
}

describe('POST /api/reports', () => {
  it('generates a report from stored metrics when GitHub is not connected', async () => {
    const app = buildApp();
    const token = await signUp(app, 'alice@example.com');
    const repositoryId = await repoFor('alice@example.com');
    await prisma.metrics.create({
      data: {
        repositoryId,
        date: new Date(new Date().toISOString().slice(0, 10)),
        openIssues: 7,
        closedIssues: 3,
        openPRs: 2,
        mergedPRs: 4,
        ciPassRate: 0.75,
      },
    });

    const res = await request(app)
      .post('/api/reports')
      .set('Authorization', `Bearer ${token}`)
      .send({ repositoryId })
      .expect(201);

    expect(res.body.report).toMatchObject({
      summary: 'Riepilogo di acme/web',
      model: 'fake-model',
      repository: { id: repositoryId, name: 'acme/web' },
    });
    expect(res.body.report.content).toContain('| PR merged | 4 | 0 |');
    expect(generator.inputs[0]).toMatchObject({ githubDataAvailable: false });
    expect(await prisma.report.count()).toBe(1);
  });

  it('includes stale issues and pull requests when GitHub is connected', async () => {
    const app = buildApp();
    const token = await signUp(app, 'alice@example.com');
    await request(app)
      .put('/api/github/token')
      .set('Authorization', `Bearer ${token}`)
      .send({ token: GITHUB_TOKEN })
      .expect(200);
    const repositoryId = await repoFor('alice@example.com');
    const old = new Date(Date.now() - 60 * DAY_MS);
    github.open = [
      makeIssue({ number: 11, createdAt: old, updatedAt: old }),
      makeIssue({ number: 12, isPullRequest: true, createdAt: old, updatedAt: old }),
    ];

    await request(app)
      .post('/api/reports')
      .set('Authorization', `Bearer ${token}`)
      .send({ repositoryId })
      .expect(201);

    expect(generator.inputs[0]?.staleIssues.map((i) => i.number)).toEqual([11]);
    expect(generator.inputs[0]?.stalePullRequests.map((i) => i.number)).toEqual([12]);
  });

  it('answers 503 when no AI provider is configured', async () => {
    const app = buildApp(null);
    const token = await signUp(app, 'alice@example.com');
    const repositoryId = await repoFor('alice@example.com');

    const res = await request(app)
      .post('/api/reports')
      .set('Authorization', `Bearer ${token}`)
      .send({ repositoryId });
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('AI_NOT_CONFIGURED');
  });

  it("refuses to generate a report on another user's repository", async () => {
    const app = buildApp();
    await signUp(app, 'alice@example.com');
    const bob = await signUp(app, 'bob@example.com');
    const repositoryId = await repoFor('alice@example.com');

    await request(app)
      .post('/api/reports')
      .set('Authorization', `Bearer ${bob}`)
      .send({ repositoryId })
      .expect(404);
    expect(generator.inputs).toHaveLength(0);
  });
});

describe('report history and export', () => {
  async function seedReports(app: Express) {
    const alice = await signUp(app, 'alice@example.com');
    const bob = await signUp(app, 'bob@example.com');
    const web = await repoFor('alice@example.com', 'acme/web');
    const api = await repoFor('alice@example.com', 'acme/api');
    const auth = { Authorization: `Bearer ${alice}` };
    for (const repositoryId of [web, api, web]) {
      await request(app).post('/api/reports').set(auth).send({ repositoryId }).expect(201);
    }
    return { alice, bob, web, auth };
  }

  it('lists only the caller reports, newest first, filtered by repository', async () => {
    const app = buildApp();
    const { bob, web, auth } = await seedReports(app);

    const all = await request(app).get('/api/reports').set(auth).expect(200);
    expect(all.body.reports).toHaveLength(3);
    const dates = all.body.reports.map((r: { generatedAt: string }) => r.generatedAt);
    expect([...dates].sort().reverse()).toEqual(dates);

    const filtered = await request(app).get(`/api/reports?repositoryId=${web}`).set(auth);
    expect(filtered.body.reports).toHaveLength(2);

    const other = await request(app).get('/api/reports').set('Authorization', `Bearer ${bob}`);
    expect(other.body.reports).toHaveLength(0);
  });

  it('exports Markdown and PDF as downloads, and hides reports from other users', async () => {
    const app = buildApp();
    const { bob, auth } = await seedReports(app);
    const [report] = (await request(app).get('/api/reports?limit=1').set(auth)).body
      .reports as Array<{
      id: string;
    }>;
    const id = report?.id ?? '';

    const md = await request(app).get(`/api/reports/${id}/export?format=md`).set(auth).expect(200);
    expect(md.headers['content-type']).toMatch(/text\/markdown/);
    expect(md.headers['content-disposition']).toMatch(
      /attachment; filename="report-acme-web-\d{4}-\d{2}-\d{2}\.md"/,
    );
    expect(md.text).toContain('# Report settimanale: acme/web');

    const pdf = await request(app)
      .get(`/api/reports/${id}/export?format=pdf`)
      .set(auth)
      .buffer(true)
      .parse((res, done) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => done(null, Buffer.concat(chunks)));
      })
      .expect(200);
    expect(pdf.headers['content-type']).toBe('application/pdf');
    expect((pdf.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');

    await request(app).get(`/api/reports/${id}/export?format=docx`).set(auth).expect(400);
    const bobAuth = { Authorization: `Bearer ${bob}` };
    await request(app).get(`/api/reports/${id}`).set(bobAuth).expect(404);
    await request(app).get(`/api/reports/${id}/export`).set(bobAuth).expect(404);
    await request(app).delete(`/api/reports/${id}`).set(bobAuth).expect(404);
    await request(app).delete(`/api/reports/${id}`).set(auth).expect(204);
  });
});

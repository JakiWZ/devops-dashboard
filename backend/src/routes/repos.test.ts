import type { Express } from 'express';
import request from 'supertest';
import { createApp } from '../app.js';
import { HttpError } from '../lib/http-error.js';
import { prisma } from '../lib/prisma.js';
import { FakeEmailSender, FakeGitHubClient, resetDatabase } from '../test/helpers.js';

const VALID_TOKEN = 'ghp_valid';
const webRepo = {
  githubId: 101,
  fullName: 'acme/web',
  url: 'https://github.com/acme/web',
  defaultBranch: 'main',
  isPrivate: false,
};

let app: Express;
let github: FakeGitHubClient;
let tokensSeen: string[];

beforeEach(async () => {
  await resetDatabase();
  github = new FakeGitHubClient();
  github.repos = [webRepo, { ...webRepo, githubId: 102, fullName: 'acme/api' }];
  tokensSeen = [];
  app = createApp({
    databaseProbe: async () => undefined,
    emailSender: new FakeEmailSender(),
    githubClientFactory: (token) => {
      tokensSeen.push(token);
      if (token !== VALID_TOKEN) {
        return Object.assign(new FakeGitHubClient(), {
          getLogin: () =>
            Promise.reject(new HttpError(400, 'GitHub token is invalid', 'GITHUB_TOKEN_INVALID')),
        });
      }
      return github;
    },
  });
});

afterAll(() => prisma.$disconnect());

async function signUp(email = 'alice@example.com'): Promise<string> {
  const res = await request(app)
    .post('/api/auth/register')
    .send({ email, password: 'correct-horse-battery' });
  return res.body.accessToken as string;
}

async function connectedUser(email?: string): Promise<string> {
  const token = await signUp(email);
  await request(app)
    .put('/api/github/token')
    .set('Authorization', `Bearer ${token}`)
    .send({ token: VALID_TOKEN })
    .expect(200);
  return token;
}

async function trackRepo(token: string, fullName = 'acme/web'): Promise<string> {
  const res = await request(app)
    .post('/api/repos')
    .set('Authorization', `Bearer ${token}`)
    .send({ fullName })
    .expect(201);
  return res.body.repository.id as string;
}

describe('GitHub connection', () => {
  it('requires authentication', async () => {
    await request(app).get('/api/repos').expect(401);
    await request(app).put('/api/github/token').send({ token: VALID_TOKEN }).expect(401);
  });

  it('stores the token encrypted after verifying it on GitHub', async () => {
    const token = await connectedUser();

    const status = await request(app).get('/api/github').set('Authorization', `Bearer ${token}`);
    expect(status.body).toEqual({ configured: true, connected: true, login: 'octocat' });

    const user = await prisma.user.findUniqueOrThrow({ where: { email: 'alice@example.com' } });
    expect(user.githubTokenEnc).toBeTruthy();
    expect(user.githubTokenEnc).not.toContain(VALID_TOKEN);
  });

  it('does not store a token that GitHub rejects', async () => {
    const token = await signUp();
    const res = await request(app)
      .put('/api/github/token')
      .set('Authorization', `Bearer ${token}`)
      .send({ token: 'ghp_wrong' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('GITHUB_TOKEN_INVALID');
    const user = await prisma.user.findUniqueOrThrow({ where: { email: 'alice@example.com' } });
    expect(user.githubTokenEnc).toBeNull();
  });

  it('asks to connect GitHub before tracking repositories', async () => {
    const token = await signUp();
    const res = await request(app)
      .post('/api/repos')
      .set('Authorization', `Bearer ${token}`)
      .send({ fullName: 'acme/web' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('GITHUB_NOT_CONNECTED');
  });
});

describe('repositories', () => {
  it('tracks a repository once and hides it from the available list', async () => {
    const token = await connectedUser();
    await trackRepo(token);

    const duplicate = await request(app)
      .post('/api/repos')
      .set('Authorization', `Bearer ${token}`)
      .send({ fullName: 'acme/web' });
    expect(duplicate.status).toBe(409);

    const available = await request(app)
      .get('/api/repos/available')
      .set('Authorization', `Bearer ${token}`);
    expect(available.body.repositories.map((r: { fullName: string }) => r.fullName)).toEqual([
      'acme/api',
    ]);
    expect(tokensSeen.every((t) => t === VALID_TOKEN)).toBe(true);
  });

  it('validates the repository name', async () => {
    const token = await connectedUser();
    const res = await request(app)
      .post('/api/repos')
      .set('Authorization', `Bearer ${token}`)
      .send({ fullName: 'not a repo' });
    expect(res.status).toBe(400);
  });

  it("returns 404 for another user's repository on every route", async () => {
    const alice = await connectedUser('alice@example.com');
    const bob = await connectedUser('bob@example.com');
    const id = await trackRepo(alice);
    const auth = { Authorization: `Bearer ${bob}` };

    await request(app).get(`/api/repos/${id}`).set(auth).expect(404);
    await request(app).get(`/api/repos/${id}/metrics`).set(auth).expect(404);
    await request(app).post(`/api/repos/${id}/sync`).set(auth).expect(404);
    await request(app).delete(`/api/repos/${id}`).set(auth).expect(404);
    expect(await prisma.repository.count()).toBe(1);
  });
});

describe('sync', () => {
  it('backfills 30 days of metrics and is idempotent', async () => {
    const token = await connectedUser();
    const id = await trackRepo(token);
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    github.open = [{ isPullRequest: false, createdAt: yesterday, closedAt: null, mergedAt: null }];
    github.closed = [{ isPullRequest: true, createdAt: yesterday, closedAt: now, mergedAt: now }];
    github.runs = [
      { createdAt: now, conclusion: 'success' },
      { createdAt: now, conclusion: 'failure' },
    ];

    const auth = { Authorization: `Bearer ${token}` };
    const first = await request(app).post(`/api/repos/${id}/sync`).set(auth).expect(200);
    expect(first.body.daysUpdated).toBe(30);
    expect(first.body.repository.syncStatus).toBe('IDLE');
    await request(app).post(`/api/repos/${id}/sync`).set(auth).expect(200);

    expect(await prisma.metrics.count({ where: { repositoryId: id } })).toBe(30);
    const detail = await request(app).get(`/api/repos/${id}`).set(auth);
    expect(detail.body.repository.latestMetrics).toMatchObject({
      openIssues: 1,
      openPRs: 0,
      mergedPRs: 1,
      ciPassRate: 0.5,
    });
    // Il secondo sync è incrementale: riparte dal giorno dell'ultimo sync.
    const [firstSince, secondSince] = github.closedSince;
    expect(secondSince?.getTime()).toBeGreaterThan(firstSince?.getTime() ?? Infinity);
  });

  it('records the failure and frees the lock when GitHub fails', async () => {
    const token = await connectedUser();
    const id = await trackRepo(token);
    github.fail = new Error('GitHub exploded');

    await request(app)
      .post(`/api/repos/${id}/sync`)
      .set('Authorization', `Bearer ${token}`)
      .expect(500);

    const repo = await prisma.repository.findUniqueOrThrow({ where: { id } });
    expect(repo).toMatchObject({ syncStatus: 'FAILED', lastSyncError: 'GitHub exploded' });
  });

  it('rejects a concurrent sync on the same repository', async () => {
    const token = await connectedUser();
    const id = await trackRepo(token);
    await prisma.repository.update({
      where: { id },
      data: { syncStatus: 'SYNCING', syncStartedAt: new Date() },
    });

    const res = await request(app)
      .post(`/api/repos/${id}/sync`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('SYNC_IN_PROGRESS');
  });
});

describe('metrics', () => {
  it('returns the series in the requested range and rejects ranges over a year', async () => {
    const token = await connectedUser();
    const id = await trackRepo(token);
    const values = { openIssues: 1, closedIssues: 0, openPRs: 0, mergedPRs: 0, ciPassRate: null };
    await prisma.metrics.createMany({
      data: ['2026-01-01', '2026-01-02', '2026-01-03'].map((day) => ({
        ...values,
        repositoryId: id,
        date: new Date(`${day}T00:00:00Z`),
      })),
    });
    const auth = { Authorization: `Bearer ${token}` };

    const res = await request(app)
      .get(`/api/repos/${id}/metrics?from=2026-01-02&to=2026-01-03`)
      .set(auth)
      .expect(200);
    expect(res.body.metrics).toHaveLength(2);

    await request(app)
      .get(`/api/repos/${id}/metrics?from=2024-01-01&to=2026-01-01`)
      .set(auth)
      .expect(400);
    await request(app).get(`/api/repos/${id}/metrics?from=2026-13-01`).set(auth).expect(400);
  });
});

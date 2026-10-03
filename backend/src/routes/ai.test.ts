import type { Express } from 'express';
import request from 'supertest';
import { createApp } from '../app.js';
import { prisma } from '../lib/prisma.js';
import type { ReportDraft } from '../services/reports/report-draft.js';
import { chatCompletion, fakeCatalog, jsonResponse } from '../test/ai-fakes.js';
import { FakeEmailSender, FakeGitHubClient, resetDatabase } from '../test/helpers.js';

const GOOD_KEY = 'zai-good-key-1234';

const draft: ReportDraft = {
  summary: 'Steady week.',
  weeklyActivity: 'Nothing unusual.',
  highlights: [],
  techDebt: [],
  priorities: [],
};

/** Provider finto: accetta solo GOOD_KEY e risponde alle chat completion con un report valido. */
const providerRequests: string[] = [];
const fakeProviderFetch = (async (url: string | URL | Request, init?: RequestInit) => {
  const target = String(url);
  providerRequests.push(target);
  const headers = new Headers(init?.headers);
  if (headers.get('authorization') !== `Bearer ${GOOD_KEY}`) {
    return jsonResponse(401, { error: 'invalid api key' });
  }
  if (target.endsWith('/models')) {
    return jsonResponse(200, { data: [{ id: 'glm-5.3' }, { id: 'glm-5.3-flash' }] });
  }
  return chatCompletion(JSON.stringify(draft));
}) as typeof globalThis.fetch;

let app: Express;

beforeEach(async () => {
  await resetDatabase();
  providerRequests.length = 0;
  app = createApp({
    databaseProbe: async () => undefined,
    emailSender: new FakeEmailSender(),
    githubClientFactory: () => new FakeGitHubClient(),
    aiCatalog: fakeCatalog(),
    aiFetch: fakeProviderFetch,
  });
});

afterAll(() => prisma.$disconnect());

async function signUp(email = 'alice@example.com'): Promise<{ token: string; userId: string }> {
  const res = await request(app)
    .post('/api/auth/register')
    .send({ email, password: 'correct-horse-battery' });
  return { token: res.body.accessToken as string, userId: res.body.user.id as string };
}

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

describe('AI provider settings', () => {
  it('lists catalog providers, flagging the unsupported ones', async () => {
    const { token } = await signUp();
    const res = await request(app).get('/api/ai/providers').set(auth(token)).expect(200);
    expect(res.body.providers).toContainEqual(
      expect.objectContaining({ id: 'zai-coding-plan', supported: true, modelCount: 2 }),
    );
    expect(res.body.providers).toContainEqual(
      expect.objectContaining({ id: 'bedrock', supported: false }),
    );
  });

  it('verifies a key and returns the models without saving anything', async () => {
    const { token, userId } = await signUp();
    const res = await request(app)
      .post('/api/ai/verify')
      .set(auth(token))
      .send({ provider: 'zai-coding-plan', apiKey: GOOD_KEY })
      .expect(200);
    expect(res.body.models.map((m: { id: string }) => m.id)).toEqual(['glm-5.3', 'glm-5.3-flash']);
    expect(await prisma.aiCredential.count({ where: { userId } })).toBe(0);
  });

  it('rejects a wrong key with a clear error', async () => {
    const { token } = await signUp();
    const res = await request(app)
      .post('/api/ai/verify')
      .set(auth(token))
      .send({ provider: 'zai-coding-plan', apiKey: 'wrong-key-0000' })
      .expect(400);
    expect(res.body.error.code).toBe('AI_KEY_INVALID');
  });

  it('saves the key encrypted and never returns it', async () => {
    const { token, userId } = await signUp();
    const res = await request(app)
      .put('/api/ai/credential')
      .set(auth(token))
      .send({ provider: 'zai-coding-plan', apiKey: GOOD_KEY, model: 'glm-5.3' })
      .expect(200);
    expect(res.body.credential).toMatchObject({
      provider: 'zai-coding-plan',
      providerName: 'Z.AI Coding Plan',
      model: 'glm-5.3',
      keyLast4: '1234',
    });
    expect(JSON.stringify(res.body)).not.toContain(GOOD_KEY);
    const stored = await prisma.aiCredential.findUniqueOrThrow({ where: { userId } });
    expect(stored.apiKeyEnc).not.toContain(GOOD_KEY);

    const settings = await request(app).get('/api/ai/settings').set(auth(token)).expect(200);
    expect(JSON.stringify(settings.body)).not.toContain(GOOD_KEY);
  });

  it('refuses to save a key that does not work or a model it cannot use', async () => {
    const { token, userId } = await signUp();
    await request(app)
      .put('/api/ai/credential')
      .set(auth(token))
      .send({ provider: 'zai-coding-plan', apiKey: 'wrong-key-0000', model: 'glm-5.3' })
      .expect(400);
    const res = await request(app)
      .put('/api/ai/credential')
      .set(auth(token))
      .send({ provider: 'zai-coding-plan', apiKey: GOOD_KEY, model: 'gpt-imaginary' })
      .expect(400);
    expect(res.body.error.code).toBe('AI_MODEL_INVALID');
    expect(await prisma.aiCredential.count({ where: { userId } })).toBe(0);
  });

  it('switches model and removes the key', async () => {
    const { token } = await signUp();
    await request(app)
      .put('/api/ai/credential')
      .set(auth(token))
      .send({ provider: 'zai-coding-plan', apiKey: GOOD_KEY, model: 'glm-5.3' })
      .expect(200);
    const changed = await request(app)
      .patch('/api/ai/credential')
      .set(auth(token))
      .send({ model: 'glm-5.3-flash' })
      .expect(200);
    expect(changed.body.credential.model).toBe('glm-5.3-flash');

    await request(app).delete('/api/ai/credential').set(auth(token)).expect(204);
    const settings = await request(app).get('/api/ai/settings').set(auth(token)).expect(200);
    expect(settings.body.credential).toBeNull();
  });

  it("generates reports with the user's own provider and records it", async () => {
    const { token, userId } = await signUp();
    const repo = await prisma.repository.create({
      data: { userId, githubId: 42, name: 'acme/web', url: 'https://github.com/acme/web' },
    });

    // Senza chiave dell'utente né del server la generazione non è disponibile.
    await request(app)
      .post('/api/reports')
      .set(auth(token))
      .send({ repositoryId: repo.id })
      .expect(503);

    await request(app)
      .put('/api/ai/credential')
      .set(auth(token))
      .send({ provider: 'zai-coding-plan', apiKey: GOOD_KEY, model: 'glm-5.3' })
      .expect(200);
    const res = await request(app)
      .post('/api/reports')
      .set(auth(token))
      .send({ repositoryId: repo.id })
      .expect(201);
    expect(res.body.report).toMatchObject({
      provider: 'zai-coding-plan',
      model: 'glm-5.3',
      summary: 'Steady week.',
    });
    expect(providerRequests.at(-1)).toBe('https://api.z.ai/api/coding/paas/v4/chat/completions');
  });

  it("keeps each user's key private", async () => {
    const alice = await signUp('alice@example.com');
    const bob = await signUp('bob@example.com');
    await request(app)
      .put('/api/ai/credential')
      .set(auth(alice.token))
      .send({ provider: 'zai-coding-plan', apiKey: GOOD_KEY, model: 'glm-5.3' })
      .expect(200);
    const res = await request(app).get('/api/ai/settings').set(auth(bob.token)).expect(200);
    expect(res.body.credential).toBeNull();
  });
});

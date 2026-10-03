import type { Express } from 'express';
import request from 'supertest';
import { createApp } from '../app.js';
import { prisma } from '../lib/prisma.js';
import { TelegramChatGoneError } from '../services/notifications/telegram.js';
import {
  FakeEmailSender,
  FakeGitHubClient,
  FakeTelegram,
  issueFixture,
  resetDatabase,
  runFixture,
} from '../test/helpers.js';

const WEBHOOK_SECRET = 'hook-secret-123';
const DAY_MS = 24 * 60 * 60 * 1000;

let app: Express;
let email: FakeEmailSender;
let telegram: FakeTelegram;
let github: FakeGitHubClient;

beforeEach(async () => {
  await resetDatabase();
  email = new FakeEmailSender();
  telegram = new FakeTelegram();
  github = new FakeGitHubClient();
  github.repos = [
    {
      githubId: 101,
      fullName: 'acme/web',
      url: 'https://github.com/acme/web',
      defaultBranch: 'main',
      isPrivate: false,
    },
  ];
  app = createApp({
    databaseProbe: async () => undefined,
    emailSender: email,
    githubClientFactory: () => github,
    reportGenerator: null,
    telegram: { api: telegram, botUsername: 'devops_bot', webhookSecret: WEBHOOK_SECRET },
  });
});

afterAll(() => prisma.$disconnect());

async function signUp(address = 'alice@example.com'): Promise<string> {
  const res = await request(app)
    .post('/api/auth/register')
    .send({ email: address, password: 'correct-horse-battery' });
  return res.body.accessToken as string;
}

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

const prefs = {
  emailEnabled: true,
  telegramEnabled: false,
  weeklyReport: true,
  ciFailureAlerts: true,
  stalledPrAlerts: true,
  weeklyDay: 1,
  weeklyHour: 8,
  timezone: 'Europe/Rome',
};

function webhook(text: string, chat = { id: 4242, type: 'private' }) {
  return request(app)
    .post('/api/telegram/webhook')
    .set('X-Telegram-Bot-Api-Secret-Token', WEBHOOK_SECRET)
    .send({ update_id: 1, message: { message_id: 1, chat, text } });
}

async function connectTelegram(token: string): Promise<void> {
  const res = await request(app)
    .post('/api/notifications/telegram/link')
    .set(auth(token))
    .expect(201);
  const code = new URL(res.body.url as string).searchParams.get('start');
  await webhook(`/start ${code}`).expect(200);
}

describe('notification preferences', () => {
  it('starts with every channel off and the defaults for the weekly report', async () => {
    const token = await signUp();
    const res = await request(app).get('/api/notifications').set(auth(token)).expect(200);
    expect(res.body).toEqual({
      preferences: expect.objectContaining({
        emailEnabled: false,
        telegramEnabled: false,
        weeklyReport: true,
        weeklyDay: 1,
        weeklyHour: 8,
        timezone: 'UTC',
      }),
      email: { address: 'alice@example.com', configured: false },
      telegram: { configured: true, connected: false },
    });
  });

  it('saves the preferences', async () => {
    const token = await signUp();
    const res = await request(app)
      .put('/api/notifications')
      .set(auth(token))
      .send(prefs)
      .expect(200);
    expect(res.body.preferences).toEqual(prefs);
  });

  it('rejects an unknown time zone', async () => {
    const token = await signUp();
    await request(app)
      .put('/api/notifications')
      .set(auth(token))
      .send({ ...prefs, timezone: 'Mars/Olympus' })
      .expect(400);
  });

  it('does not enable Telegram before the chat is connected', async () => {
    const token = await signUp();
    const res = await request(app)
      .put('/api/notifications')
      .set(auth(token))
      .send({ ...prefs, telegramEnabled: true })
      .expect(400);
    expect(res.body.error.code).toBe('TELEGRAM_NOT_CONNECTED');
  });
});

describe('Telegram bot', () => {
  it('connects the chat that opens the one-time link', async () => {
    const token = await signUp();
    const link = await request(app)
      .post('/api/notifications/telegram/link')
      .set(auth(token))
      .expect(201);
    expect(link.body.url).toMatch(/^https:\/\/t\.me\/devops_bot\?start=[\w-]+$/);

    const code = new URL(link.body.url as string).searchParams.get('start');
    await webhook(`/start ${code}`).expect(200);

    const res = await request(app).get('/api/notifications').set(auth(token)).expect(200);
    expect(res.body.telegram.connected).toBe(true);
    expect(res.body.preferences.telegramEnabled).toBe(true);
    expect(telegram.sent.at(-1)).toEqual({
      chatId: '4242',
      text: expect.stringContaining('Connected'),
    });

    // Il codice è monouso.
    await webhook(`/start ${code}`, { id: 777, type: 'private' }).expect(200);
    expect(telegram.sent.at(-1)?.text).toContain('expired');
  });

  it('rejects calls without the webhook secret', async () => {
    await request(app)
      .post('/api/telegram/webhook')
      .set('X-Telegram-Bot-Api-Secret-Token', 'wrong')
      .send({ message: { chat: { id: 1, type: 'private' }, text: '/start x' } })
      .expect(401);
  });

  it('refuses group chats and disconnects on /stop', async () => {
    const token = await signUp();
    await webhook('/start abc', { id: -100, type: 'group' }).expect(200);
    expect(telegram.sent.at(-1)?.text).toContain('private chat');

    await connectTelegram(token);
    await webhook('/stop').expect(200);
    const res = await request(app).get('/api/notifications').set(auth(token)).expect(200);
    expect(res.body.telegram.connected).toBe(false);
    expect(res.body.preferences.telegramEnabled).toBe(false);
  });
});

describe('test notification', () => {
  it('asks to enable a channel first', async () => {
    const token = await signUp();
    const res = await request(app).post('/api/notifications/test').set(auth(token)).expect(400);
    expect(res.body.error.code).toBe('NO_CHANNEL_ENABLED');
  });

  it('sends to every enabled channel', async () => {
    const token = await signUp();
    await connectTelegram(token);
    await request(app)
      .put('/api/notifications')
      .set(auth(token))
      .send({ ...prefs, telegramEnabled: true });
    const res = await request(app).post('/api/notifications/test').set(auth(token)).expect(200);
    expect(res.body.delivered).toEqual(['email', 'telegram']);
    expect(email.sent[0]).toMatchObject({
      to: 'alice@example.com',
      subject: expect.stringContaining('test'),
    });
    expect(telegram.sent.at(-1)?.text).toContain('test notification');
  });

  it('disconnects a chat that blocked the bot', async () => {
    const token = await signUp();
    await connectTelegram(token);
    telegram.fail = new TelegramChatGoneError('Forbidden: bot was blocked by the user');
    const res = await request(app).post('/api/notifications/test').set(auth(token)).expect(502);
    expect(res.body.error.code).toBe('NOTIFICATION_FAILED');
    const settings = await request(app).get('/api/notifications').set(auth(token));
    expect(settings.body.telegram.connected).toBe(false);
  });
});

describe('alerts after a sync', () => {
  async function trackedRepo(token: string): Promise<string> {
    await request(app)
      .put('/api/github/token')
      .set(auth(token))
      .send({ token: 'ghp_x' })
      .expect(200);
    const res = await request(app)
      .post('/api/repos')
      .set(auth(token))
      .send({ fullName: 'acme/web' })
      .expect(201);
    return res.body.repository.id as string;
  }

  it('notifies new CI failures and stalled PRs once', async () => {
    const token = await signUp();
    const repoId = await trackedRepo(token);
    await request(app).put('/api/notifications').set(auth(token)).send(prefs).expect(200);

    const now = Date.now();
    github.runs = [
      runFixture({ url: 'https://github.com/acme/web/actions/runs/9', conclusion: 'failure' }),
      runFixture({ url: 'https://github.com/acme/web/actions/runs/10', conclusion: 'success' }),
    ];
    github.open = [
      issueFixture({
        number: 7,
        title: 'Refactor auth',
        url: 'https://github.com/acme/web/pull/7',
        isPullRequest: true,
        createdAt: new Date(now - 20 * DAY_MS),
        updatedAt: new Date(now - 10 * DAY_MS),
      }),
      issueFixture({
        number: 8,
        url: 'https://github.com/acme/web/pull/8',
        isPullRequest: true,
        isDraft: true,
        updatedAt: new Date(now - 10 * DAY_MS),
      }),
    ];

    await request(app).post(`/api/repos/${repoId}/sync`).set(auth(token)).expect(200);
    expect(email.sent).toHaveLength(1);
    expect(email.sent[0]?.subject).toBe('acme/web: 2 new alerts');
    expect(email.sent[0]?.text).toContain('actions/runs/9');
    expect(email.sent[0]?.text).toContain('PR #7 stalled for 10 days');
    expect(email.sent[0]?.text).not.toContain('pull/8');

    await request(app).post(`/api/repos/${repoId}/sync`).set(auth(token)).expect(200);
    expect(email.sent).toHaveLength(1);
  });

  it('stays quiet when alerts are off', async () => {
    const token = await signUp();
    const repoId = await trackedRepo(token);
    await request(app)
      .put('/api/notifications')
      .set(auth(token))
      .send({ ...prefs, ciFailureAlerts: false, stalledPrAlerts: false })
      .expect(200);
    github.runs = [runFixture({ conclusion: 'failure' })];
    await request(app).post(`/api/repos/${repoId}/sync`).set(auth(token)).expect(200);
    expect(email.sent).toHaveLength(0);
  });
});

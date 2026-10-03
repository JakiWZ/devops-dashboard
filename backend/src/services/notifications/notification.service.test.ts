import { prisma } from '../../lib/prisma.js';
import { FakeEmailSender, FakeTelegram, resetDatabase } from '../../test/helpers.js';
import { NotificationService, type WeeklyRepoSummary } from './notification.service.js';

// Lunedì 5 ottobre 2026, 08:20 a Roma (UTC+2).
const NOW = new Date('2026-10-05T06:20:00.000Z');

let email: FakeEmailSender;
let summaries: WeeklyRepoSummary[];
let service: NotificationService;

beforeEach(async () => {
  await resetDatabase();
  email = new FakeEmailSender();
  summaries = [
    { name: 'acme/web', summary: 'Two PRs merged.', reportUrl: 'http://app/reports/r1' },
    { name: 'acme/api', summary: 'Open issues 3', reportUrl: null },
  ];
  service = new NotificationService(
    prisma,
    email,
    { summariesFor: async () => summaries },
    {
      emailConfigured: true,
      telegram: { api: new FakeTelegram(), botUsername: 'bot', webhookSecret: null },
      appUrl: 'http://app',
      now: () => NOW,
    },
  );
});

afterAll(() => prisma.$disconnect());

async function userWithPrefs(overrides: Record<string, unknown> = {}): Promise<string> {
  const user = await prisma.user.create({
    data: { email: 'bob@example.com', passwordHash: 'x' },
  });
  await prisma.notificationPreference.create({
    data: {
      userId: user.id,
      emailEnabled: true,
      weeklyDay: 1,
      weeklyHour: 8,
      timezone: 'Europe/Rome',
      ...overrides,
    },
  });
  return user.id;
}

describe('weekly report notifications', () => {
  it('sends the report in the chosen local hour, once', async () => {
    await userWithPrefs();
    await expect(service.sendDueWeeklyReports()).resolves.toBe(1);
    expect(email.sent).toHaveLength(1);
    expect(email.sent[0]?.subject).toBe('Weekly DevOps report: 2 repositories');
    expect(email.sent[0]?.text).toContain('acme/web\nTwo PRs merged.\nhttp://app/reports/r1');
    expect(email.sent[0]?.text).toContain('http://app/settings/notifications');

    await expect(service.sendDueWeeklyReports()).resolves.toBe(0);
    expect(email.sent).toHaveLength(1);
  });

  it('waits for the chosen day and hour', async () => {
    await userWithPrefs({ weeklyHour: 9 });
    await expect(service.sendDueWeeklyReports()).resolves.toBe(0);
    expect(email.sent).toHaveLength(0);
  });

  it('skips users with the weekly report off', async () => {
    await userWithPrefs({ weeklyReport: false });
    await expect(service.sendDueWeeklyReports()).resolves.toBe(0);
  });
});

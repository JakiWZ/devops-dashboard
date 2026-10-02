import { PrismaClient, Role } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();
const DAYS = 30;

// Credenziali solo per l'ambiente demo, documentate nel README. Mai usare il seed in produzione.
const DEMO_PASSWORD = 'demo-password';

function startOfDayUtc(daysAgo: number): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return d;
}

async function main(): Promise<void> {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);
  const user = await prisma.user.upsert({
    where: { email: 'demo@example.com' },
    update: { passwordHash, role: Role.ADMIN },
    create: { email: 'demo@example.com', passwordHash, role: Role.ADMIN },
  });
  await prisma.user.upsert({
    where: { email: 'user@example.com' },
    update: { passwordHash, role: Role.USER },
    create: { email: 'user@example.com', passwordHash, role: Role.USER },
  });

  const repos = [
    { githubId: 1001, name: 'acme/web-app', url: 'https://github.com/acme/web-app' },
    { githubId: 1002, name: 'acme/api-gateway', url: 'https://github.com/acme/api-gateway' },
  ];

  for (const [index, data] of repos.entries()) {
    const repo = await prisma.repository.upsert({
      where: { userId_githubId: { userId: user.id, githubId: data.githubId } },
      update: { lastSyncedAt: new Date() },
      create: { ...data, userId: user.id, lastSyncedAt: new Date() },
    });

    for (let day = DAYS - 1; day >= 0; day--) {
      const t = DAYS - day;
      const metrics = {
        openIssues: 20 + index * 10 + Math.round(5 * Math.sin(t / 4)),
        closedIssues: 3 * t + index * 5,
        openPRs: 4 + ((t + index) % 5),
        mergedPRs: 2 * t + index,
        ciPassRate: Math.round((0.85 + 0.1 * Math.cos(t / 3)) * 100) / 100,
      };
      const date = startOfDayUtc(day);
      await prisma.metrics.upsert({
        where: { repositoryId_date: { repositoryId: repo.id, date } },
        update: metrics,
        create: { ...metrics, date, repositoryId: repo.id },
      });
    }

    const reportCount = await prisma.report.count({ where: { repositoryId: repo.id } });
    if (reportCount === 0) {
      await prisma.report.create({
        data: {
          repositoryId: repo.id,
          summary: `Demo weekly summary for ${data.name}`,
          content: `# ${data.name}\n\nReport demo generato dal seed. I report reali arrivano in Fase 4.`,
        },
      });
    }
  }

  console.log(
    `Seed completed: 2 users (admin + user), ${repos.length} repositories, ${DAYS} days of metrics each`,
  );
}

main()
  .catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

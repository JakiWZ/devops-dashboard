import { PrismaClient, Role } from '@prisma/client';
import bcrypt from 'bcryptjs';
import type { ReportAnalysis } from '../src/services/reports/report-generator.js';
import { buildReportInput } from '../src/services/reports/report-input.js';
import { renderReportMarkdown } from '../src/services/reports/report-render.js';

const prisma = new PrismaClient();
// Tre mesi di storico: abbastanza per grafici e filtri per intervallo senza un token GitHub.
const DAYS = 90;

// Credenziali solo per l'ambiente demo, documentate nel README. Mai usare il seed in produzione.
const DEMO_PASSWORD = 'demo-password';

function startOfDayUtc(daysAgo: number): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return d;
}

function demoAnalysis(name: string, mergedPRs: number): ReportAnalysis {
  return {
    summary: `Report demo per ${name}: ${mergedPRs} PR merged negli ultimi 7 giorni. Generato dal seed, non da Claude.`,
    highlights: ['Dati demo: collega GitHub e imposta ANTHROPIC_API_KEY per un report reale.'],
    techDebt: [],
    priorities: [
      {
        title: 'Collegare il repository reale',
        rationale: 'Senza dati GitHub il report non può individuare issue e PR ferme.',
        priority: 'medium',
      },
    ],
  };
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
    { githubId: 1003, name: 'acme/infra', url: 'https://github.com/acme/infra', isPrivate: true },
  ];

  for (const [index, data] of repos.entries()) {
    const repo = await prisma.repository.upsert({
      where: { userId_githubId: { userId: user.id, githubId: data.githubId } },
      update: { lastSyncedAt: new Date(), syncStatus: 'IDLE' },
      create: { ...data, defaultBranch: 'main', userId: user.id, lastSyncedAt: new Date() },
    });

    for (let day = DAYS - 1; day >= 0; day--) {
      const t = DAYS - day;
      const date = startOfDayUtc(day);
      const weekend = date.getUTCDay() === 0 || date.getUTCDay() === 6;
      // Valori giornalieri (chiuse/merged del giorno) come quelli prodotti dal sync reale.
      const metrics = {
        openIssues: 20 + index * 10 + Math.round(5 * Math.sin(t / 7)) + Math.floor(t / 30),
        closedIssues: weekend ? 0 : (t + index) % 4,
        openPRs: 4 + ((t + index) % 5),
        mergedPRs: weekend ? 0 : (t * (index + 1)) % 3,
        // Nel weekend nessuna run CI: ciPassRate null, come nel sync reale.
        ciPassRate: weekend ? null : Math.round((0.85 + 0.1 * Math.cos(t / 5 + index)) * 100) / 100,
      };
      await prisma.metrics.upsert({
        where: { repositoryId_date: { repositoryId: repo.id, date } },
        update: metrics,
        create: { ...metrics, date, repositoryId: repo.id },
      });
    }

    // Report demo costruito con lo stesso renderer dei report reali, ma senza chiamare l'LLM.
    // Rimpiazza i report demo precedenti, compresi i placeholder delle fasi 1-3.
    await prisma.report.deleteMany({
      where: {
        repositoryId: repo.id,
        OR: [{ model: 'seed' }, { summary: { startsWith: 'Demo weekly summary for' } }],
      },
    });
    const metrics = await prisma.metrics.findMany({ where: { repositoryId: repo.id } });
    const input = buildReportInput(data.name, metrics, null, new Date());
    const analysis = demoAnalysis(data.name, input.thisWeek.mergedPRs);
    await prisma.report.create({
      data: {
        repositoryId: repo.id,
        summary: analysis.summary,
        content: renderReportMarkdown(input, analysis),
        model: 'seed',
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
      },
    });
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

import { prisma } from '../lib/prisma.js';

export type DatabaseStatus = 'up' | 'down';

export interface HealthReport {
  status: 'ok' | 'degraded';
  uptime: number;
  timestamp: string;
  database: DatabaseStatus;
}

export type DatabaseProbe = () => Promise<void>;

export const prismaProbe: DatabaseProbe = async () => {
  await prisma.$queryRaw`SELECT 1`;
};

export async function getHealth(probe: DatabaseProbe): Promise<HealthReport> {
  let database: DatabaseStatus = 'up';
  try {
    await probe();
  } catch {
    database = 'down';
  }
  return {
    status: database === 'up' ? 'ok' : 'degraded',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    database,
  };
}

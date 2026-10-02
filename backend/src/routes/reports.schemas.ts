import { z } from 'zod';

export const generateReportSchema = z.object({ repositoryId: z.string().min(1).max(64) });

export const listReportsQuerySchema = z.object({
  repositoryId: z.string().min(1).max(64).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const exportQuerySchema = z.object({ format: z.enum(['md', 'pdf']).default('md') });

export type GenerateReportInput = z.infer<typeof generateReportSchema>;

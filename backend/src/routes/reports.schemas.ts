import { z } from 'zod';

const isoDate = z.iso.date().transform((value) => new Date(`${value}T00:00:00.000Z`));

export const createReportSchema = z.object({ repositoryId: z.string().min(1).max(64) });

export const listReportsQuerySchema = z
  .object({
    repositoryId: z.string().min(1).max(64).optional(),
    from: isoDate.optional(),
    to: isoDate.optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    offset: z.coerce.number().int().min(0).default(0),
  })
  .refine(({ from, to }) => !from || !to || from <= to, 'from must be before to');

export const exportQuerySchema = z.object({
  format: z.enum(['markdown', 'pdf']).default('markdown'),
});

export type CreateReportInput = z.infer<typeof createReportSchema>;

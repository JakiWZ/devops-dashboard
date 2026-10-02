import { z } from 'zod';

export const githubTokenSchema = z.object({ token: z.string().trim().min(1).max(255) });

export const trackRepoSchema = z.object({
  fullName: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9-]{1,39}\/[A-Za-z0-9._-]{1,100}$/, 'must be in the form owner/name'),
});

const isoDate = z.iso.date().transform((value) => new Date(`${value}T00:00:00.000Z`));

/** Al massimo un anno per richiesta, per tenere la risposta piccola. */
export const MAX_METRICS_RANGE_DAYS = 366;

export const metricsQuerySchema = z
  .object({ from: isoDate.optional(), to: isoDate.optional() })
  .refine(({ from, to }) => !from || !to || from <= to, 'from must be before to');

export type GitHubTokenInput = z.infer<typeof githubTokenSchema>;
export type TrackRepoInput = z.infer<typeof trackRepoSchema>;

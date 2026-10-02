import { z } from 'zod';

/**
 * Struttura che il modello deve restituire (structured outputs). Niente vincoli numerici:
 * li verifichiamo noi dopo, il JSON schema dei structured outputs ne supporta pochi.
 */
export const reportDraftSchema = z.object({
  summary: z.string().describe('Two or three sentences: the state of the repository this week.'),
  weeklyActivity: z
    .string()
    .describe('One or two short paragraphs describing what happened this week, citing numbers.'),
  highlights: z.array(z.string()).describe('Up to five notable facts, one sentence each.'),
  techDebt: z
    .array(
      z.object({
        title: z.string(),
        category: z.enum(['stale_issue', 'stalled_pr', 'ci', 'trend', 'other']),
        severity: z.enum(['high', 'medium', 'low']),
        evidence: z.string().describe('The data points that justify this item.'),
        references: z
          .array(z.string())
          .describe('URLs copied exactly from the data. Empty if none applies.'),
      }),
    )
    .describe('Tech debt items, most severe first.'),
  priorities: z
    .array(
      z.object({
        title: z.string(),
        rationale: z.string(),
        effort: z.enum(['small', 'medium', 'large']),
      }),
    )
    .describe('Up to five recommended next actions, most important first.'),
});

export type ReportDraft = z.infer<typeof reportDraftSchema>;

import { z } from 'zod';

// Le risposte del backend sono validate al confine: un cambio di contratto emerge come errore
// esplicito invece che come `undefined` sparso nei componenti.

export const userSchema = z.object({
  id: z.string(),
  email: z.string(),
  role: z.enum(['USER', 'ADMIN']),
  createdAt: z.string(),
});

export const sessionSchema = z.object({ user: userSchema, accessToken: z.string() });

export const metricsSchema = z.object({
  date: z.string(),
  openIssues: z.number(),
  closedIssues: z.number(),
  openPRs: z.number(),
  mergedPRs: z.number(),
  ciPassRate: z.number().nullable(),
});

export const syncStatusSchema = z.enum(['IDLE', 'SYNCING', 'FAILED']);

export const repositorySchema = z.object({
  id: z.string(),
  name: z.string(),
  url: z.string(),
  defaultBranch: z.string().nullable(),
  isPrivate: z.boolean(),
  syncStatus: syncStatusSchema,
  lastSyncError: z.string().nullable(),
  lastSyncedAt: z.string().nullable(),
  latestMetrics: metricsSchema.nullable().optional(),
});

export const repositoryListSchema = z.object({ repositories: z.array(repositorySchema) });
export const repositoryResponseSchema = z.object({ repository: repositorySchema });

export const availableRepoSchema = z.object({
  githubId: z.number(),
  fullName: z.string(),
  url: z.string(),
  isPrivate: z.boolean(),
});
export const availableReposSchema = z.object({ repositories: z.array(availableRepoSchema) });

export const metricsRangeSchema = z.object({
  from: z.string(),
  to: z.string(),
  metrics: z.array(metricsSchema),
});

export const githubStatusSchema = z.object({
  configured: z.boolean(),
  connected: z.boolean(),
  login: z.string().nullable(),
});

export const reportSummarySchema = z.object({
  id: z.string(),
  repositoryId: z.string(),
  repositoryName: z.string(),
  summary: z.string(),
  generatedAt: z.string(),
  model: z.string().nullable(),
  provider: z.string().nullable().optional(),
  periodStart: z.string().nullable(),
  periodEnd: z.string().nullable(),
});

export const reportListSchema = z.object({
  reports: z.array(reportSummarySchema),
  total: z.number(),
});

export const reportSchema = reportSummarySchema.extend({ content: z.string() });
export const reportResponseSchema = z.object({ report: reportSchema });

export const aiProviderSchema = z.object({
  id: z.string(),
  name: z.string(),
  doc: z.string().nullable(),
  supported: z.boolean(),
  modelCount: z.number(),
});
export const aiProvidersSchema = z.object({ providers: z.array(aiProviderSchema) });

export const aiModelSchema = z.object({
  id: z.string(),
  name: z.string(),
  reasoning: z.boolean(),
  contextWindow: z.number().nullable(),
  cost: z.object({ input: z.number(), output: z.number() }).nullable(),
  releaseDate: z.string().nullable(),
});
export const aiModelsSchema = z.object({ models: z.array(aiModelSchema) });
export const aiVerifySchema = z.object({ valid: z.literal(true), models: z.array(aiModelSchema) });

export const aiSettingsSchema = z.object({
  credential: z
    .object({
      provider: z.string(),
      providerName: z.string(),
      model: z.string(),
      keyLast4: z.string(),
      updatedAt: z.string(),
    })
    .nullable(),
  serverDefault: z.object({ provider: z.string(), model: z.string() }).nullable(),
  canStoreKeys: z.boolean(),
});

export type User = z.infer<typeof userSchema>;
export type Session = z.infer<typeof sessionSchema>;
export type Metrics = z.infer<typeof metricsSchema>;
export type SyncStatus = z.infer<typeof syncStatusSchema>;
export type Repository = z.infer<typeof repositorySchema>;
export type AvailableRepo = z.infer<typeof availableRepoSchema>;
export type GitHubStatus = z.infer<typeof githubStatusSchema>;
export type ReportSummary = z.infer<typeof reportSummarySchema>;
export type Report = z.infer<typeof reportSchema>;
export type AiProvider = z.infer<typeof aiProviderSchema>;
export type AiModel = z.infer<typeof aiModelSchema>;
export type AiSettings = z.infer<typeof aiSettingsSchema>;

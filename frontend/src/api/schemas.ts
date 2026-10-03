import { z } from 'zod/mini';

// Le risposte del backend sono validate al confine (con zod/mini, che a differenza dell'API
// classica è tree-shakable e pesa molto meno nel bundle iniziale): un cambio di contratto emerge come errore
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
  ciPassRate: z.nullable(z.number()),
});

export const syncStatusSchema = z.enum(['IDLE', 'SYNCING', 'FAILED']);

export const repositorySchema = z.object({
  id: z.string(),
  name: z.string(),
  url: z.string(),
  defaultBranch: z.nullable(z.string()),
  isPrivate: z.boolean(),
  syncStatus: syncStatusSchema,
  lastSyncError: z.nullable(z.string()),
  lastSyncedAt: z.nullable(z.string()),
  latestMetrics: z.optional(z.nullable(metricsSchema)),
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
  login: z.nullable(z.string()),
});

export const reportSummarySchema = z.object({
  id: z.string(),
  repositoryId: z.string(),
  repositoryName: z.string(),
  summary: z.string(),
  generatedAt: z.string(),
  model: z.nullable(z.string()),
  provider: z.optional(z.nullable(z.string())),
  periodStart: z.nullable(z.string()),
  periodEnd: z.nullable(z.string()),
});

export const reportListSchema = z.object({
  reports: z.array(reportSummarySchema),
  total: z.number(),
});

export const reportSchema = z.extend(reportSummarySchema, { content: z.string() });
export const reportResponseSchema = z.object({ report: reportSchema });

export const aiProviderSchema = z.object({
  id: z.string(),
  name: z.string(),
  doc: z.nullable(z.string()),
  supported: z.boolean(),
  modelCount: z.number(),
});
export const aiProvidersSchema = z.object({ providers: z.array(aiProviderSchema) });

export const aiModelSchema = z.object({
  id: z.string(),
  name: z.string(),
  reasoning: z.boolean(),
  contextWindow: z.nullable(z.number()),
  cost: z.nullable(z.object({ input: z.number(), output: z.number() })),
  releaseDate: z.nullable(z.string()),
});
export const aiModelsSchema = z.object({ models: z.array(aiModelSchema) });
export const aiVerifySchema = z.object({ valid: z.literal(true), models: z.array(aiModelSchema) });

export const aiSettingsSchema = z.object({
  credential: z.nullable(
    z.object({
      provider: z.string(),
      providerName: z.string(),
      model: z.string(),
      keyLast4: z.string(),
      updatedAt: z.string(),
    }),
  ),
  serverDefault: z.nullable(z.object({ provider: z.string(), model: z.string() })),
  canStoreKeys: z.boolean(),
});

export const notificationPreferencesSchema = z.object({
  emailEnabled: z.boolean(),
  telegramEnabled: z.boolean(),
  weeklyReport: z.boolean(),
  ciFailureAlerts: z.boolean(),
  stalledPrAlerts: z.boolean(),
  weeklyDay: z.number(),
  weeklyHour: z.number(),
  timezone: z.string(),
});

export const notificationSettingsSchema = z.object({
  preferences: notificationPreferencesSchema,
  email: z.object({ address: z.string(), configured: z.boolean() }),
  telegram: z.object({ configured: z.boolean(), connected: z.boolean() }),
});

export const telegramLinkSchema = z.object({ url: z.string(), expiresAt: z.string() });
export const testNotificationSchema = z.object({
  delivered: z.array(z.enum(['email', 'telegram'])),
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
export type NotificationPreferences = z.infer<typeof notificationPreferencesSchema>;
export type NotificationSettings = z.infer<typeof notificationSettingsSchema>;

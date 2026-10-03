import { z } from 'zod';
import { request, requestJson } from './http';
import {
  aiModelsSchema,
  aiProvidersSchema,
  aiSettingsSchema,
  aiVerifySchema,
  availableReposSchema,
  githubStatusSchema,
  metricsRangeSchema,
  notificationSettingsSchema,
  reportListSchema,
  reportResponseSchema,
  repositoryListSchema,
  repositoryResponseSchema,
  sessionSchema,
  telegramLinkSchema,
  testNotificationSchema,
  userSchema,
  type NotificationPreferences,
} from './schemas';

export interface Credentials {
  email: string;
  password: string;
}

export interface DateRange {
  /** Date ISO `YYYY-MM-DD`, estremi inclusi. */
  from: string;
  to: string;
}

function query(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : '';
}

export const authApi = {
  login: (body: Credentials) =>
    requestJson('/api/auth/login', sessionSchema, { method: 'POST', body }),
  register: (body: Credentials) =>
    requestJson('/api/auth/register', sessionSchema, { method: 'POST', body }),
  logout: () => request('/api/auth/logout', { method: 'POST' }),
  me: () => requestJson('/api/auth/me', z.object({ user: userSchema })),
};

export const githubApi = {
  status: () => requestJson('/api/github', githubStatusSchema),
  connect: (token: string) =>
    requestJson('/api/github/token', githubStatusSchema, { method: 'PUT', body: { token } }),
  disconnect: () => request('/api/github/token', { method: 'DELETE' }),
};

export const reposApi = {
  list: () => requestJson('/api/repos', repositoryListSchema),
  available: () => requestJson('/api/repos/available', availableReposSchema),
  get: (id: string) =>
    requestJson(`/api/repos/${encodeURIComponent(id)}`, repositoryResponseSchema),
  track: (fullName: string) =>
    requestJson('/api/repos', repositoryResponseSchema, { method: 'POST', body: { fullName } }),
  remove: (id: string) => request(`/api/repos/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  metrics: (id: string, range: DateRange) =>
    requestJson(
      `/api/repos/${encodeURIComponent(id)}/metrics${query({ ...range })}`,
      metricsRangeSchema,
    ),
  sync: (id: string) =>
    requestJson(
      `/api/repos/${encodeURIComponent(id)}/sync`,
      z.object({ repository: z.unknown() }),
      {
        method: 'POST',
      },
    ),
};

export interface ReportFilters {
  repositoryId?: string;
  from?: string;
  to?: string;
  limit: number;
  offset: number;
}

export type ExportFormat = 'markdown' | 'pdf';

export const reportsApi = {
  list: (filters: ReportFilters) =>
    requestJson(`/api/reports${query({ ...filters })}`, reportListSchema),
  get: (id: string) => requestJson(`/api/reports/${encodeURIComponent(id)}`, reportResponseSchema),
  generate: (repositoryId: string) =>
    requestJson('/api/reports', reportResponseSchema, { method: 'POST', body: { repositoryId } }),
  remove: (id: string) => request(`/api/reports/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  /** L'export richiede il Bearer token: non basta un link, scarichiamo il blob e lo salviamo. */
  export: async (id: string, format: ExportFormat): Promise<{ blob: Blob; fileName: string }> => {
    const res = await request(`/api/reports/${encodeURIComponent(id)}/export?format=${format}`);
    const disposition = res.headers.get('Content-Disposition') ?? '';
    const match = /filename="?([^";]+)"?/.exec(disposition);
    const fallback = `report.${format === 'pdf' ? 'pdf' : 'md'}`;
    return { blob: await res.blob(), fileName: match?.[1] ?? fallback };
  },
};

export const aiApi = {
  providers: () => requestJson('/api/ai/providers', aiProvidersSchema),
  models: (provider: string) =>
    requestJson(`/api/ai/providers/${encodeURIComponent(provider)}/models`, aiModelsSchema),
  verify: (provider: string, apiKey: string) =>
    requestJson('/api/ai/verify', aiVerifySchema, { method: 'POST', body: { provider, apiKey } }),
  settings: () => requestJson('/api/ai/settings', aiSettingsSchema),
  save: (body: { provider: string; apiKey: string; model: string }) =>
    requestJson('/api/ai/credential', aiSettingsSchema, { method: 'PUT', body }),
  setModel: (model: string) =>
    requestJson('/api/ai/credential', aiSettingsSchema, { method: 'PATCH', body: { model } }),
  remove: () => request('/api/ai/credential', { method: 'DELETE' }),
};

export const notificationsApi = {
  settings: () => requestJson('/api/notifications', notificationSettingsSchema),
  save: (body: NotificationPreferences) =>
    requestJson('/api/notifications', notificationSettingsSchema, { method: 'PUT', body }),
  telegramLink: () =>
    requestJson('/api/notifications/telegram/link', telegramLinkSchema, { method: 'POST' }),
  disconnectTelegram: () =>
    requestJson('/api/notifications/telegram', notificationSettingsSchema, { method: 'DELETE' }),
  test: () => requestJson('/api/notifications/test', testNotificationSchema, { method: 'POST' }),
};

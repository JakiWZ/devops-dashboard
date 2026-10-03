import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useId, useMemo, useState, type ReactNode } from 'react';
import { notificationsApi } from '../api/endpoints';
import type { NotificationPreferences, NotificationSettings } from '../api/schemas';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { ErrorMessage } from '../components/ErrorMessage';
import { Spinner } from '../components/Spinner';
import { queryKeys, useNotificationSettings } from '../hooks/queries';

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const selectClass =
  'rounded-md border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-900';

function browserTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

function timezones(current: string): string[] {
  const all = Intl.supportedValuesOf('timeZone');
  // La lista del browser non include sempre "UTC" né il fuso già salvato.
  return [...new Set(['UTC', current, ...all])];
}

function Toggle({
  label,
  description,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  description?: ReactNode;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  const id = useId();
  return (
    <div className="flex items-start gap-3 text-sm">
      <input
        id={id}
        type="checkbox"
        className="mt-0.5 h-4 w-4"
        checked={checked}
        disabled={disabled}
        aria-describedby={description ? `${id}-description` : undefined}
        onChange={(e) => onChange(e.target.checked)}
      />
      <div>
        <label htmlFor={id} className="font-medium">
          {label}
        </label>
        {description && (
          <p id={`${id}-description`} className="text-slate-600 dark:text-slate-400">
            {description}
          </p>
        )}
      </div>
    </div>
  );
}

function TelegramChannel({
  settings,
  enabled,
  onToggle,
  link,
  onLink,
}: {
  settings: NotificationSettings;
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  link: { url: string } | null;
  onLink: (link: { url: string } | null) => void;
}) {
  const queryClient = useQueryClient();
  const createLink = useMutation({ mutationFn: notificationsApi.telegramLink, onSuccess: onLink });
  const disconnect = useMutation({
    mutationFn: notificationsApi.disconnectTelegram,
    onSuccess: (data) => queryClient.setQueryData(queryKeys.notifications, data),
  });

  if (!settings.telegram.configured) {
    return (
      <p className="text-sm text-slate-600 dark:text-slate-400">
        Telegram is not available on this server (missing <code>TELEGRAM_BOT_TOKEN</code>).
      </p>
    );
  }
  if (settings.telegram.connected) {
    return (
      <div className="flex flex-wrap items-start justify-between gap-3">
        <Toggle
          label="Telegram"
          description="Messages from the DevOps Dashboard bot."
          checked={enabled}
          onChange={onToggle}
        />
        <Button disabled={disconnect.isPending} onClick={() => disconnect.mutate()}>
          Disconnect Telegram
        </Button>
        {disconnect.error && <ErrorMessage error={disconnect.error} />}
      </div>
    );
  }
  return (
    <div className="space-y-2 text-sm">
      <p className="font-medium">Telegram</p>
      {link ? (
        <p role="status" className="text-slate-600 dark:text-slate-400">
          <a href={link.url} target="_blank" rel="noreferrer" className="font-medium underline">
            Open the bot in Telegram
          </a>{' '}
          and press Start. This page updates by itself once the chat is connected. The link expires
          in 15 minutes.
        </p>
      ) : (
        <Button disabled={createLink.isPending} onClick={() => createLink.mutate()}>
          Connect Telegram
        </Button>
      )}
      {createLink.error && <ErrorMessage error={createLink.error} />}
    </div>
  );
}

function PreferencesForm({
  settings,
  link,
  onLink,
}: {
  settings: NotificationSettings;
  link: { url: string } | null;
  onLink: (link: { url: string } | null) => void;
}) {
  const queryClient = useQueryClient();
  const connected = settings.telegram.connected;
  const [draft, setDraft] = useState<{ prefs: NotificationPreferences; connected: boolean } | null>(
    null,
  );
  // Se la chat Telegram si collega o scollega nel frattempo, il server ha cambiato le preferenze:
  // la bozza non vale più e si riparte dai valori salvati.
  const current = draft?.connected === connected ? draft : null;
  const prefs = current?.prefs ?? settings.preferences;
  const zones = useMemo(() => timezones(prefs.timezone), [prefs.timezone]);
  const set = (patch: Partial<NotificationPreferences>) =>
    setDraft({ prefs: { ...prefs, ...patch }, connected });

  const save = useMutation({
    mutationFn: () => notificationsApi.save(prefs),
    onSuccess: (data) => {
      queryClient.setQueryData(queryKeys.notifications, data);
      setDraft(null);
    },
  });
  const test = useMutation({ mutationFn: notificationsApi.test });
  const dirty = current !== null;

  return (
    <form
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <Card title="Channels">
        <div className="space-y-4">
          <Toggle
            label="Email"
            description={
              settings.email.configured ? (
                `Sent to ${settings.email.address}.`
              ) : (
                <>
                  Sent to {settings.email.address}. Email delivery is not configured on this server
                  (missing <code>RESEND_API_KEY</code>): messages are only logged.
                </>
              )
            }
            checked={prefs.emailEnabled}
            onChange={(emailEnabled) => set({ emailEnabled })}
          />
          <TelegramChannel
            settings={settings}
            enabled={prefs.telegramEnabled}
            onToggle={(telegramEnabled) => set({ telegramEnabled })}
            link={connected ? null : link}
            onLink={onLink}
          />
        </div>
      </Card>

      <Card title="What to receive">
        <div className="space-y-4">
          <Toggle
            label="Weekly report"
            description="An AI report for each tracked repository, or the latest metrics if AI is not configured."
            checked={prefs.weeklyReport}
            onChange={(weeklyReport) => set({ weeklyReport })}
          />
          <Toggle
            label="CI failures"
            description="A failed workflow run, checked at every repository sync."
            checked={prefs.ciFailureAlerts}
            onChange={(ciFailureAlerts) => set({ ciFailureAlerts })}
          />
          <Toggle
            label="Stalled pull requests"
            description="Open, non-draft pull requests with no updates for 7 days."
            checked={prefs.stalledPrAlerts}
            onChange={(stalledPrAlerts) => set({ stalledPrAlerts })}
          />
        </div>
      </Card>

      <Card title="Weekly report schedule">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <label className="flex items-center gap-2">
            <span className="text-slate-600 dark:text-slate-400">Day</span>
            <select
              aria-label="Day"
              className={selectClass}
              value={prefs.weeklyDay}
              disabled={!prefs.weeklyReport}
              onChange={(e) => set({ weeklyDay: Number(e.target.value) })}
            >
              {WEEKDAYS.map((day, index) => (
                <option key={day} value={index}>
                  {day}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2">
            <span className="text-slate-600 dark:text-slate-400">Hour</span>
            <select
              aria-label="Hour"
              className={selectClass}
              value={prefs.weeklyHour}
              disabled={!prefs.weeklyReport}
              onChange={(e) => set({ weeklyHour: Number(e.target.value) })}
            >
              {Array.from({ length: 24 }, (_, hour) => (
                <option key={hour} value={hour}>
                  {String(hour).padStart(2, '0')}:00
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2">
            <span className="text-slate-600 dark:text-slate-400">Time zone</span>
            <select
              aria-label="Time zone"
              className={selectClass}
              value={prefs.timezone}
              disabled={!prefs.weeklyReport}
              onChange={(e) => set({ timezone: e.target.value })}
            >
              {zones.map((zone) => (
                <option key={zone} value={zone}>
                  {zone}
                </option>
              ))}
            </select>
          </label>
          {prefs.weeklyReport && prefs.timezone !== browserTimezone() && (
            <button
              type="button"
              className="text-sm underline"
              onClick={() => set({ timezone: browserTimezone() })}
            >
              Use my time zone ({browserTimezone()})
            </button>
          )}
        </div>
      </Card>

      {save.error && <ErrorMessage error={save.error} />}
      {test.error && <ErrorMessage error={test.error} />}
      {test.data && (
        <p role="status" className="text-sm text-emerald-700 dark:text-emerald-300">
          ✓ Test notification sent via {test.data.delivered.join(' and ')}.
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="primary" disabled={!dirty || save.isPending}>
          {save.isPending ? 'Saving…' : dirty ? 'Save' : 'Saved'}
        </Button>
        <Button disabled={dirty || test.isPending} onClick={() => test.mutate()}>
          {test.isPending ? 'Sending…' : 'Send test notification'}
        </Button>
      </div>
    </form>
  );
}

export function NotificationsPage() {
  const [link, setLink] = useState<{ url: string } | null>(null);
  const settings = useNotificationSettings(link !== null);

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold">Notifications</h1>
      {settings.isPending ? (
        <Spinner />
      ) : settings.error ? (
        <ErrorMessage error={settings.error} onRetry={() => void settings.refetch()} />
      ) : (
        <PreferencesForm settings={settings.data} link={link} onLink={setLink} />
      )}
    </div>
  );
}

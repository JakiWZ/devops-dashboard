import type { GitHubIssue, GitHubWorkflowRun } from '../github/github.types.js';
import { STALLED_PR_DAYS } from '../reports/report-input.js';

const DAY_MS = 24 * 60 * 60 * 1000;
/** Run CI più vecchie di così non generano alert: evita di notificare lo storico al primo sync. */
export const CI_ALERT_WINDOW_MS = DAY_MS;
const FAILED = new Set(['failure', 'timed_out', 'startup_failure']);

export interface AlertCandidate {
  /** Chiave di deduplica: lo stesso evento non viene notificato due volte. */
  key: string;
  kind: 'ci_failure' | 'stalled_pr';
  line: string;
}

/**
 * Alert per un repository appena sincronizzato: run CI fallite di recente e PR aperte
 * ferme da almeno STALLED_PR_DAYS giorni (le bozze sono escluse).
 */
export function findAlerts(params: {
  open: GitHubIssue[];
  runs: GitHubWorkflowRun[];
  now: Date;
  /** Run precedenti a questo istante non generano alert (es. data di attivazione delle notifiche). */
  notBefore: Date;
  ciFailures: boolean;
  stalledPrs: boolean;
}): AlertCandidate[] {
  const { open, runs, now, ciFailures, stalledPrs } = params;
  const since = new Date(Math.max(params.notBefore.getTime(), now.getTime() - CI_ALERT_WINDOW_MS));
  const alerts: AlertCandidate[] = [];

  if (ciFailures) {
    for (const run of runs) {
      if (!run.conclusion || !FAILED.has(run.conclusion) || run.createdAt < since) continue;
      alerts.push({
        key: `ci:${run.url}`,
        kind: 'ci_failure',
        line: `CI failed: ${run.name} (${run.conclusion}) ${run.url}`,
      });
    }
  }

  if (stalledPrs) {
    for (const pr of open) {
      if (!pr.isPullRequest || pr.isDraft) continue;
      const idleDays = Math.floor((now.getTime() - pr.updatedAt.getTime()) / DAY_MS);
      if (idleDays < STALLED_PR_DAYS) continue;
      // L'ultimo aggiornamento fa parte della chiave: una PR che si muove e si riferma notifica di nuovo.
      alerts.push({
        key: `pr:${pr.url}:${pr.updatedAt.toISOString()}`,
        kind: 'stalled_pr',
        line: `PR #${pr.number} stalled for ${idleDays} days: ${pr.title.slice(0, 120)} ${pr.url}`,
      });
    }
  }
  return alerts;
}

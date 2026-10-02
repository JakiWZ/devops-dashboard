import type { ReportDraft } from './report-draft.js';
import type { ReportInput } from './report-input.js';

/** Neutralizza la sintassi Markdown nel testo libero (output del modello, titoli GitHub). */
export function escapeMarkdown(text: string): string {
  return text.replace(/[\\`*_{}[\]()#+!|<>]/g, '\\$&').replace(/\r?\n/g, ' ');
}

/** Paragrafi lunghi del modello: escape riga per riga, mantenendo gli a capo tra paragrafi. */
function escapeParagraphs(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((paragraph) => escapeMarkdown(paragraph.trim()))
    .filter(Boolean)
    .join('\n\n');
}

function percent(value: number | null): string {
  return value === null ? 'n/a' : `${Math.round(value * 100)}%`;
}

function count(value: number | null): string {
  return value === null ? 'n/a' : String(value);
}

const SEVERITY_LABEL = { high: 'High', medium: 'Medium', low: 'Low' } as const;

/**
 * Il Markdown lo costruiamo noi dal JSON validato, non lo chiediamo al modello: formato stabile,
 * testo escapato e link limitati agli URL presenti nei dati.
 */
export function renderReportMarkdown(
  input: ReportInput,
  draft: ReportDraft,
  allowedUrls: Set<string>,
): string {
  const { weekly } = input;
  const lines: string[] = [
    `# Weekly report: ${escapeMarkdown(input.repository.name)}`,
    '',
    `Period: ${input.period.from} to ${input.period.to}`,
    '',
    escapeParagraphs(draft.summary),
    '',
    '## Key metrics',
    '',
    '| Metric | Value |',
    '| --- | --- |',
    `| Issues opened / closed | ${count(weekly.issuesOpened)} / ${weekly.issuesClosed} |`,
    `| PRs opened / merged | ${count(weekly.prsOpened)} / ${weekly.prsMerged} |`,
    `| Open issues / open PRs | ${count(weekly.openIssues)} / ${count(weekly.openPRs)} |`,
    `| CI pass rate | ${percent(weekly.ciPassRate)} |`,
    '',
    '## Weekly activity',
    '',
    escapeParagraphs(draft.weeklyActivity),
    '',
  ];

  if (draft.highlights.length) {
    lines.push('## Highlights', '', ...draft.highlights.map((h) => `- ${escapeMarkdown(h)}`), '');
  }

  lines.push('## Tech debt', '');
  if (draft.techDebt.length === 0) lines.push('No significant tech debt detected.', '');
  for (const item of draft.techDebt) {
    lines.push(`### [${SEVERITY_LABEL[item.severity]}] ${escapeMarkdown(item.title)}`, '');
    lines.push(escapeParagraphs(item.evidence), '');
    const refs = item.references.filter((url) => allowedUrls.has(url));
    if (refs.length) lines.push(...refs.map((url) => `- <${url}>`), '');
  }

  lines.push('## Priorities', '');
  draft.priorities.forEach((p, index) => {
    lines.push(
      `${index + 1}. **${escapeMarkdown(p.title)}** (effort: ${p.effort}): ${escapeMarkdown(p.rationale)}`,
    );
  });
  if (draft.priorities.length === 0) lines.push('No priorities suggested.');
  lines.push('');

  if (!input.liveGitHubData) {
    lines.push(
      '> Generated from synced metrics only: connect GitHub for issue and pull request details.',
      '',
    );
  }
  return lines.join('\n');
}

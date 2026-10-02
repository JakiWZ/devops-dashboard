import { escapeMarkdown, renderReportMarkdown } from './markdown.js';
import type { ReportDraft } from './report-draft.js';
import { buildReportInput } from './report-input.js';

const input = buildReportInput({
  repository: { name: 'acme/web', url: 'https://github.com/acme/web', defaultBranch: 'main' },
  metrics: [],
  live: { open: [], closed: [], runs: [] },
  now: new Date('2026-10-02T12:00:00Z'),
});

const draft: ReportDraft = {
  summary: 'Steady week.',
  weeklyActivity: 'First paragraph.\n\nSecond paragraph.',
  highlights: ['CI is green'],
  techDebt: [
    {
      title: 'Old issue',
      category: 'stale_issue',
      severity: 'high',
      evidence: 'Open for 90 days.',
      references: ['https://github.com/acme/web', 'https://evil.example/phish'],
    },
  ],
  priorities: [{ title: 'Triage', rationale: 'Backlog is growing.', effort: 'small' }],
};

describe('renderReportMarkdown', () => {
  const markdown = renderReportMarkdown(input, draft, new Set(['https://github.com/acme/web']));

  it('renders every section with the metrics table', () => {
    expect(markdown).toContain('# Weekly report: acme/web');
    expect(markdown).toContain('Period: 2026-09-25 to 2026-10-02');
    expect(markdown).toContain('| CI pass rate | n/a |');
    expect(markdown).toContain('First paragraph.\n\nSecond paragraph.');
    expect(markdown).toContain('### [High] Old issue');
    expect(markdown).toContain('1. **Triage** (effort: small): Backlog is growing.');
  });

  it('keeps only links that come from the data', () => {
    expect(markdown).toContain('- <https://github.com/acme/web>');
    expect(markdown).not.toContain('evil.example');
  });

  it('escapes markdown and HTML coming from model or GitHub text', () => {
    const hostile = renderReportMarkdown(
      input,
      { ...draft, summary: '<img src=x onerror=alert(1)> [click](http://x)' },
      new Set(),
    );
    expect(hostile).toContain('\\<img src=x onerror=alert\\(1\\)\\> \\[click\\]\\(http://x\\)');
  });
});

describe('escapeMarkdown', () => {
  it('flattens newlines so a title cannot start a new block', () => {
    expect(escapeMarkdown('line\n# heading')).toBe('line \\# heading');
  });
});

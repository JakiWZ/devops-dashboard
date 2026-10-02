import type { ReportAnalysis } from './report-generator.js';
import { buildReportInput } from './report-input.js';
import { renderReportMarkdown, renderReportPdf } from './report-render.js';

const analysis: ReportAnalysis = {
  summary: 'Settimana produttiva.',
  highlights: ['CI stabile'],
  techDebt: [{ title: 'Login lento', detail: 'Aperta da 100 giorni', references: [3] }],
  priorities: [{ title: 'Sbloccare la PR #4', rationale: 'Ferma da 10 giorni', priority: 'high' }],
};

const input = buildReportInput('acme/web', [], null, new Date('2026-10-02T12:00:00Z'));

describe('renderReportMarkdown', () => {
  it('renders the model analysis around a metrics table built from the data', () => {
    const md = renderReportMarkdown(input, analysis);

    expect(md).toContain('# Report settimanale: acme/web');
    expect(md).toContain('| CI pass rate medio | n/d | n/d |');
    expect(md).toContain('- **Login lento** (#3): Aperta da 100 giorni');
    expect(md).toContain('1. **Sbloccare la PR #4** (priorità Alta): Ferma da 10 giorni');
    expect(md).toContain('GitHub non è collegato');
  });
});

describe('renderReportPdf', () => {
  it('produces a PDF document, tolerating characters outside the PDF font encoding', async () => {
    const pdf = await renderReportPdf(
      renderReportMarkdown(input, { ...analysis, summary: 'Ottimo lavoro 🚀 → avanti' }),
    );
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(1000);
  });
});

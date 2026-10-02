import PDFDocument from 'pdfkit';
import type { ReportAnalysis } from './report-generator.js';
import type { ReportInput, WeekStats } from './report-input.js';

/** Ascisse delle colonne della tabella metriche nel PDF (A4, margine 50). */
const TABLE_COLUMNS = [50, 250, 400];

const PRIORITY_LABEL = { high: 'Alta', medium: 'Media', low: 'Bassa' } as const;

function percent(rate: number | null): string {
  return rate === null ? 'n/d' : `${Math.round(rate * 100)}%`;
}

function count(value: number | null): string {
  return value === null ? 'n/d' : String(value);
}

function metricsTable(current: WeekStats, previous: WeekStats): string[] {
  return [
    '| Metrica | Questa settimana | Settimana precedente |',
    '| --- | --- | --- |',
    `| Issue chiuse | ${current.closedIssues} | ${previous.closedIssues} |`,
    `| PR merged | ${current.mergedPRs} | ${previous.mergedPRs} |`,
    `| CI pass rate medio | ${percent(current.avgCiPassRate)} | ${percent(previous.avgCiPassRate)} |`,
    `| Issue aperte a fine periodo | ${count(current.openIssuesAtEnd)} | ${count(previous.openIssuesAtEnd)} |`,
    `| PR aperte a fine periodo | ${count(current.openPRsAtEnd)} | ${count(previous.openPRsAtEnd)} |`,
  ];
}

/**
 * Il Markdown è costruito dal server a partire dall'output strutturato del modello:
 * formato stabile per export e frontend, e le metriche in tabella vengono dai dati, non dall'LLM.
 */
export function renderReportMarkdown(input: ReportInput, analysis: ReportAnalysis): string {
  const lines = [
    `# Report settimanale: ${input.repository}`,
    '',
    `Periodo: ${input.thisWeek.from} → ${input.thisWeek.to}`,
    '',
    '## Riepilogo',
    '',
    analysis.summary,
    '',
    '## Metriche',
    '',
    ...metricsTable(input.thisWeek, input.previousWeek),
  ];

  if (analysis.highlights.length) {
    lines.push('', '## Fatti salienti', '', ...analysis.highlights.map((h) => `- ${h}`));
  }

  lines.push('', '## Tech debt', '');
  if (analysis.techDebt.length) {
    for (const item of analysis.techDebt) {
      const refs = item.references.map((n) => `#${n}`).join(', ');
      lines.push(`- **${item.title}**${refs ? ` (${refs})` : ''}: ${item.detail}`);
    }
  } else {
    lines.push('- Nessun elemento rilevante.');
  }

  if (analysis.priorities.length) {
    lines.push('', '## Priorità consigliate', '');
    analysis.priorities.forEach((p, index) => {
      lines.push(
        `${index + 1}. **${p.title}** (priorità ${PRIORITY_LABEL[p.priority]}): ${p.rationale}`,
      );
    });
  }

  if (!input.githubDataAvailable) {
    lines.push(
      '',
      '> GitHub non è collegato: il report si basa solo sulle metriche salvate, senza issue e PR ferme.',
    );
  }

  return `${lines.join('\n')}\n`;
}

/**
 * Toglie la sintassi Markdown inline per il PDF. I font standard di PDFKit usano la codifica
 * WinAnsi: i caratteri fuori codifica (frecce, emoji) vengono sostituiti.
 */
function plain(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/`(.+?)`/g, '$1')
    .replace(/→/g, '->')
    .replace(/[^\x20-\x7e\u00a0-\u00ff\u2013\u2014\u2018\u2019\u201c\u201d\u2022\u20ac]/gu, '');
}

/**
 * Converte il Markdown generato da renderReportMarkdown in PDF. Gestisce solo i costrutti
 * che quel renderer produce (titoli, paragrafi, elenchi, tabelle, citazioni).
 */
export function renderReportPdf(markdown: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50, info: { Title: 'Report settimanale' } });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    let isHeader = true;
    for (const line of markdown.split('\n')) {
      if (!line.startsWith('|')) isHeader = true;
      if (line.startsWith('# ')) {
        doc
          .font('Helvetica-Bold')
          .fontSize(18)
          .text(plain(line.slice(2)))
          .moveDown(0.5);
      } else if (line.startsWith('## ')) {
        doc
          .moveDown(0.5)
          .font('Helvetica-Bold')
          .fontSize(13)
          .text(plain(line.slice(3)))
          .moveDown(0.3);
      } else if (line.startsWith('| --- ')) {
        isHeader = false;
      } else if (line.startsWith('|')) {
        const cells = line
          .split('|')
          .slice(1, -1)
          .map((cell) => plain(cell.trim()));
        const y = doc.y;
        cells.forEach((cell, index) => {
          doc
            .font(isHeader ? 'Helvetica-Bold' : 'Helvetica')
            .fontSize(10)
            .text(cell, TABLE_COLUMNS[index] ?? 50, y, { width: 150, lineBreak: false });
        });
        doc.x = 50;
        doc.moveDown(0.4);
      } else if (line.startsWith('> ')) {
        doc
          .font('Helvetica-Oblique')
          .fontSize(10)
          .text(plain(line.slice(2)));
      } else if (line.startsWith('- ')) {
        doc
          .font('Helvetica')
          .fontSize(11)
          .text(`•  ${plain(line.slice(2))}`, { indent: 10 });
      } else if (line.trim() === '') {
        doc.moveDown(0.3);
      } else {
        doc.font('Helvetica').fontSize(11).text(plain(line));
      }
    }
    doc.end();
  });
}

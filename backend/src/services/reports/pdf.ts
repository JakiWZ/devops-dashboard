import PDFDocument from 'pdfkit';

/** Toglie l'escape Markdown per la versione PDF, che è testo semplice. */
function unescape(text: string): string {
  return text.replace(/\\(.)/g, '$1').replace(/\*\*/g, '');
}

/**
 * PDF essenziale dal Markdown che generiamo noi (sottoinsieme noto: titoli, paragrafi,
 * elenchi, tabella metriche, citazioni). Non è un renderer Markdown generico.
 */
export function renderReportPdf(markdown: string, title: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, info: { Title: title } });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const lines = markdown.split('\n');
    lines.forEach((raw, index) => {
      const line = raw.trimEnd();
      // Riga di intestazione di una tabella (seguita dal separatore): nel PDF non serve.
      const isTableHeader = line.startsWith('|') && lines[index + 1]?.startsWith('| --- ');
      if (line === '') {
        doc.moveDown(0.5);
      } else if (line.startsWith('### ')) {
        doc
          .font('Helvetica-Bold')
          .fontSize(12)
          .text(unescape(line.slice(4)));
      } else if (line.startsWith('## ')) {
        doc
          .moveDown(0.5)
          .font('Helvetica-Bold')
          .fontSize(15)
          .text(unescape(line.slice(3)));
      } else if (line.startsWith('# ')) {
        doc
          .font('Helvetica-Bold')
          .fontSize(20)
          .text(unescape(line.slice(2)));
      } else if (line.startsWith('| --- ') || isTableHeader) {
        return;
      } else if (line.startsWith('|')) {
        const cells = line
          .split('|')
          .slice(1, -1)
          .map((c) => unescape(c.trim()));
        doc.font('Helvetica').fontSize(10).text(cells.join(':  '));
      } else if (line.startsWith('- ')) {
        const text = unescape(line.slice(2).replace(/^<(.*)>$/, '$1'));
        doc.font('Helvetica').fontSize(10).text(`•  ${text}`, { indent: 10 });
      } else if (line.startsWith('> ')) {
        doc
          .font('Helvetica-Oblique')
          .fontSize(9)
          .text(unescape(line.slice(2)));
      } else {
        doc.font('Helvetica').fontSize(10).text(unescape(line));
      }
    });
    doc.end();
  });
}

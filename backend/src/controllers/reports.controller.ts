import type { Request, RequestHandler } from 'express';
import { HttpError } from '../lib/http-error.js';
import {
  exportQuerySchema,
  listReportsQuerySchema,
  type CreateReportInput,
} from '../routes/reports.schemas.js';
import { renderReportPdf } from '../services/reports/pdf.js';
import type { ReportService } from '../services/reports/report.service.js';

function userId(req: Request): string {
  if (!req.auth) throw new HttpError(401, 'Not authenticated', 'UNAUTHENTICATED');
  return req.auth.userId;
}

function reportId(req: Request): string {
  const { id } = req.params;
  if (typeof id !== 'string') throw new HttpError(400, 'Missing report id', 'BAD_REQUEST');
  return id;
}

/** Nome file sicuro per Content-Disposition: niente virgolette o caratteri di controllo. */
function fileName(repositoryName: string, generatedAt: Date, extension: string): string {
  const slug = repositoryName.replace(/[^A-Za-z0-9._-]+/g, '-');
  return `report-${slug}-${generatedAt.toISOString().slice(0, 10)}.${extension}`;
}

export function reportsController(reports: ReportService) {
  const create: RequestHandler = async (req, res) => {
    const { repositoryId } = req.body as CreateReportInput;
    res.status(201).json({ report: await reports.generate(userId(req), repositoryId) });
  };

  const list: RequestHandler = async (req, res) => {
    res.json(await reports.list(userId(req), listReportsQuerySchema.parse(req.query)));
  };

  const get: RequestHandler = async (req, res) => {
    res.json({ report: await reports.get(userId(req), reportId(req)) });
  };

  const remove: RequestHandler = async (req, res) => {
    await reports.remove(userId(req), reportId(req));
    res.status(204).end();
  };

  const exportReport: RequestHandler = async (req, res) => {
    const { format } = exportQuerySchema.parse(req.query);
    const report = await reports.get(userId(req), reportId(req));
    if (format === 'pdf') {
      const pdf = await renderReportPdf(report.content, `Weekly report: ${report.repositoryName}`);
      res
        .type('application/pdf')
        .attachment(fileName(report.repositoryName, report.generatedAt, 'pdf'))
        .send(pdf);
      return;
    }
    res
      .type('text/markdown; charset=utf-8')
      .attachment(fileName(report.repositoryName, report.generatedAt, 'md'))
      .send(report.content);
  };

  return { create, list, get, remove, exportReport };
}

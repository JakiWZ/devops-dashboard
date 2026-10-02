import type { Request, RequestHandler } from 'express';
import { HttpError } from '../lib/http-error.js';
import {
  exportQuerySchema,
  listReportsQuerySchema,
  type GenerateReportInput,
} from '../routes/reports.schemas.js';
import type { ReportService } from '../services/reports/report.service.js';
import { renderReportPdf } from '../services/reports/report-render.js';

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
function fileName(repository: string, generatedAt: Date, ext: string): string {
  const slug = repository.replace(/[^A-Za-z0-9._-]+/g, '-');
  return `report-${slug}-${generatedAt.toISOString().slice(0, 10)}.${ext}`;
}

export function reportsController(reports: ReportService) {
  const list: RequestHandler = async (req, res) => {
    const filter = listReportsQuerySchema.parse(req.query);
    res.json({ reports: await reports.list(userId(req), filter) });
  };

  const generate: RequestHandler = async (req, res) => {
    const { repositoryId } = req.body as GenerateReportInput;
    res.status(201).json({ report: await reports.generate(userId(req), repositoryId) });
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
    const name = fileName(report.repository.name, report.generatedAt, format);
    res.attachment(name);
    if (format === 'pdf') {
      res.type('application/pdf').send(await renderReportPdf(report.content));
    } else {
      res.type('text/markdown; charset=utf-8').send(report.content);
    }
  };

  return { list, generate, get, remove, exportReport };
}

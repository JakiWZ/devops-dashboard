import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Markdown from 'react-markdown';
import { Link, useNavigate, useParams } from 'react-router';
import remarkGfm from 'remark-gfm';
import { reportsApi, type ExportFormat } from '../api/endpoints';
import { Button } from '../components/Button';
import { ErrorMessage } from '../components/ErrorMessage';
import { Spinner } from '../components/Spinner';
import { queryKeys } from '../hooks/queries';
import { formatDateTime } from '../lib/dates';

function saveBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

export function ReportDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const report = useQuery({ queryKey: queryKeys.report(id), queryFn: () => reportsApi.get(id) });
  const exportReport = useMutation({
    mutationFn: (format: ExportFormat) => reportsApi.export(id, format),
    onSuccess: ({ blob, fileName }) => saveBlob(blob, fileName),
  });
  const remove = useMutation({
    mutationFn: () => reportsApi.remove(id),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: queryKeys.report(id) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.reports });
      void navigate('/reports');
    },
  });

  if (report.isPending) return <Spinner />;
  if (report.error) {
    return <ErrorMessage error={report.error} onRetry={() => void report.refetch()} />;
  }
  const data = report.data.report;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm">
            <Link to="/reports" className="text-slate-600 hover:underline dark:text-slate-400">
              Reports
            </Link>
          </p>
          <h1 className="text-2xl font-semibold">{data.repositoryName}</h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Generated {formatDateTime(data.generatedAt)}
            {data.provider && ` · ${data.provider}`}
            {data.model && ` · ${data.model}`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button disabled={exportReport.isPending} onClick={() => exportReport.mutate('markdown')}>
            Export Markdown
          </Button>
          <Button disabled={exportReport.isPending} onClick={() => exportReport.mutate('pdf')}>
            Export PDF
          </Button>
          <Button
            variant="danger"
            disabled={remove.isPending}
            onClick={() => {
              if (window.confirm('Delete this report?')) remove.mutate();
            }}
          >
            Delete
          </Button>
        </div>
      </div>
      {exportReport.error && <ErrorMessage error={exportReport.error} />}
      {remove.error && <ErrorMessage error={remove.error} />}
      {/* Il Markdown arriva dal backend; react-markdown non renderizza HTML grezzo. */}
      <article className="markdown rounded-lg border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <Markdown
          remarkPlugins={[remarkGfm]}
          components={{
            a: ({ href, children }) => (
              <a href={href} target="_blank" rel="noreferrer">
                {children}
              </a>
            ),
          }}
        >
          {data.content}
        </Markdown>
      </article>
    </div>
  );
}

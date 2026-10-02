import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router';
import { reportsApi } from '../api/endpoints';
import { queryKeys, useAiSettings } from '../hooks/queries';
import { Button } from './Button';
import { ErrorMessage } from './ErrorMessage';

/** La generazione è sincrona lato server (30-90 s): il bottone resta in attesa e poi apre il report. */
export function GenerateReportButton({ repositoryId }: { repositoryId: string | undefined }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const ai = useAiSettings();
  const active = ai.data?.credential
    ? `${ai.data.credential.providerName} · ${ai.data.credential.model}`
    : ai.data?.serverDefault
      ? `${ai.data.serverDefault.provider} · ${ai.data.serverDefault.model} (server default)`
      : null;
  const generate = useMutation({
    mutationFn: reportsApi.generate,
    onSuccess: ({ report }) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.reports });
      queryClient.setQueryData(queryKeys.report(report.id), { report });
      void navigate(`/reports/${report.id}`);
    },
  });

  return (
    <div className="space-y-2">
      <Button
        variant="primary"
        disabled={!repositoryId || generate.isPending}
        onClick={() => repositoryId && generate.mutate(repositoryId)}
      >
        {generate.isPending ? 'Generating report…' : 'Generate report'}
      </Button>
      {ai.data && (
        <p className="text-xs text-slate-600 dark:text-slate-400">
          {active ? `Using ${active}. ` : 'No AI provider configured. '}
          <Link to="/settings/ai" className="underline">
            {active ? 'Change' : 'Add your API key'}
          </Link>
        </p>
      )}
      {generate.isPending && (
        <p role="status" className="text-sm text-slate-600 dark:text-slate-400">
          The AI is analysing the last week. This can take up to a minute.
        </p>
      )}
      {generate.error && <ErrorMessage error={generate.error} />}
    </div>
  );
}

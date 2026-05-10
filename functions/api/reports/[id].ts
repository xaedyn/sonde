import { handleGetHostedReport, type ReportKV } from '../../_shared/remote-vantage';

interface Env {
  CHRONOSCOPE_REPORTS?: ReportKV;
}

function reportId(params: EventContext<Env, string, { id?: string }>['params']): string {
  return typeof params.id === 'string' ? params.id : '';
}

export const onRequestGet: PagesFunction<Env> = (context) => {
  return handleGetHostedReport(context.request, {
    reports: context.env.CHRONOSCOPE_REPORTS,
    id: reportId(context.params),
  });
};

export const onRequestOptions: PagesFunction<Env> = (context) => {
  return handleGetHostedReport(context.request, {
    id: reportId(context.params),
  });
};

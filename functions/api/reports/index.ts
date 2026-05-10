import { handleCreateHostedReport, type ReportKV } from '../../_shared/remote-vantage';

interface Env {
  CHRONOSCOPE_REPORTS?: ReportKV;
}

export const onRequestPost: PagesFunction<Env> = (context) => {
  return handleCreateHostedReport(context.request, {
    reports: context.env.CHRONOSCOPE_REPORTS,
  });
};

export const onRequestOptions: PagesFunction<Env> = (context) => {
  return handleCreateHostedReport(context.request);
};

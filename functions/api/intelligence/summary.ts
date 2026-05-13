import { handleIntelligenceSummary, type IntelligenceStore } from '../../_shared/intelligence';

interface Env {
  CHRONOSCOPE_INTELLIGENCE?: IntelligenceStore;
}

export const onRequestGet: PagesFunction<Env> = (context) => {
  return handleIntelligenceSummary(context.request, {
    store: context.env.CHRONOSCOPE_INTELLIGENCE,
  });
};

export const onRequestOptions: PagesFunction<Env> = (context) => {
  return handleIntelligenceSummary(context.request);
};

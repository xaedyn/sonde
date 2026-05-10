import { handleSaturationRequest, type SaturationBucket } from '../../_shared/remote-vantage';

interface Env {
  CHRONOSCOPE_SATURATION?: SaturationBucket;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  return handleSaturationRequest(context.request, {
    bucket: context.env.CHRONOSCOPE_SATURATION,
  });
};

export const onRequestHead: PagesFunction<Env> = async (context) => {
  return handleSaturationRequest(context.request, {
    bucket: context.env.CHRONOSCOPE_SATURATION,
  });
};

export const onRequestOptions: PagesFunction<Env> = async (context) => {
  return handleSaturationRequest(context.request);
};

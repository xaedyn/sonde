import { handleRemoteProbe } from '../../_shared/remote-vantage';

type Env = Record<string, never>;

export const onRequestPost: PagesFunction<Env> = (context) => {
  return handleRemoteProbe(context.request, {
    cf: context.request.cf,
  });
};

export const onRequestOptions: PagesFunction<Env> = (context) => {
  return handleRemoteProbe(context.request);
};

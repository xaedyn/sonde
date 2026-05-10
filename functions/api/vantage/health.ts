interface Env {
  CHRONOSCOPE_REPORTS?: unknown;
  CHRONOSCOPE_SATURATION?: unknown;
}

export const onRequestGet: PagesFunction<Env> = (context) => {
  const edge = {
    ...(context.request.cf?.colo ? { colo: String(context.request.cf.colo) } : {}),
    ...(context.request.cf?.country ? { country: String(context.request.cf.country) } : {}),
    ...(context.request.cf?.city ? { city: String(context.request.cf.city) } : {}),
    ...(context.request.cf?.region ? { region: String(context.request.cf.region) } : {}),
  };

  return new Response(JSON.stringify({
    ok: true,
    version: 1,
    edge,
    capabilities: {
      remoteHttpTiming: true,
      hostedReports: Boolean(context.env.CHRONOSCOPE_REPORTS),
      saturationEndpoint: true,
    },
  }), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
};

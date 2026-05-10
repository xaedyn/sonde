# Cloudflare Remote Vantage Layer

Chronoscope stays browser-first, but the optional Cloudflare layer adds an
outside network witness. It answers the question the browser cannot answer on
its own: "does this endpoint look bad only from my path, or also from an edge
outside my network?"

## Capabilities

- Remote probe: `POST /api/vantage/probe` fetches up to eight public HTTP(S)
  targets from the Cloudflare edge and returns bounded timing/status/header
  evidence.
- Hosted reports: `POST /api/reports` stores a validated results snapshot in
  KV and returns a short `/r/:id` permalink. `GET /api/reports/:id` retrieves it.
- Saturation endpoint: `GET /api/vantage/saturation?bytes=...` streams a
  bounded binary response for browser-side download saturation checks.
- Health check: `GET /api/vantage/health` reports edge metadata and configured
  capabilities.

## Bindings

Configure these on the Cloudflare Pages project:

- `CHRONOSCOPE_REPORTS`: KV namespace for hosted reports. Reports expire after
  30 days.
- `CHRONOSCOPE_SATURATION`: optional R2 bucket/object binding. When an object
  named `chronoscope-saturation.bin` exists and its size matches the requested
  byte count exactly, the function serves it; otherwise it generates a
  deterministic stream.

If `CHRONOSCOPE_REPORTS` is absent, report creation returns a structured
`fallback: "hash"` response and the browser copies the existing hash-based URL
instead.

## Safety Boundaries

- Remote probes accept only public `http:` and `https:` URLs on ports 80/443.
- Credentials, localhost, link-local, private IPv4 ranges, obvious local IPv6
  ranges, `.local`, and `.internal` hosts are rejected before fetch.
- Probe responses expose only `content-type`, `server`, `cache-control`, and
  `cf-cache-status`, each length-bounded.
- Hosted report payloads are size-capped and revalidated by the browser before
  being applied.
- Remote vantage evidence is serialized into shared results so recipients see
  the same outside-path comparison the sender captured.

## Local Verification

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

The focused edge contract tests live in:

- `tests/unit/remote-vantage/functions.test.ts`
- `tests/unit/remote-vantage/insight.test.ts`
- `tests/unit/stores/remote-vantage.test.ts`
- `tests/unit/share/hosted-report-router.test.ts`
- `tests/unit/share/share-payload-builder-remote.test.ts`

## Deploy

```bash
npm run deploy
```

`public/_routes.json` keeps Pages Functions scoped to `/api/*`, and
`public/_redirects` lets `/r/:id` open the SPA before it fetches the stored
report from `/api/reports/:id`.

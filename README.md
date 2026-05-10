# Chronoscope

Chronoscope is a browser-first HTTP latency diagnostic tool. It measures several
endpoints from the user's actual network in synchronized rounds, then shows
whether latency looks healthy, isolated to one endpoint, or correlated across
multiple paths.

The short version: it is a focused "is it me or them?" instrument for HTTP
latency, not a synthetic cloud monitor.

## What It Does Today

- Runs in the browser with no account required; optional Cloudflare Functions
  add an outside vantage point and short hosted report links.
- Probes enabled endpoints in synchronized rounds using Web Workers.
- Starts with region-aware default endpoints and supports custom endpoints.
- Shows three shipped views:
  - Overview: health score, causal verdicts, shared-axis endpoint comparison,
    and recent events.
  - Live: unified, split, and focused live latency traces.
  - Diagnose: distribution, cross-endpoint comparison, phase breakdown when
    browser timing data is available, and recent samples.
- Supports endpoint nicknames, reordering, enabling/disabling, regional resets,
  timing settings, CORS mode selection, and local persistence.
- Shares configs and result snapshots through compressed URL hashes, with
  optional KV-backed `/r/:id` hosted report permalinks on Cloudflare.
- Can compare the browser's path with a Cloudflare edge probe, then preserve
  that outside-vantage evidence in shared reports.
- Blocks private/local hosts from shared URLs while still allowing local testing
  for endpoints added directly by the current user.

## Current Limits

Chronoscope's core measurement loop is still intentionally browser-first. That
means it can measure HTTP fetch timing from the user's browser, but browser
Resource Timing phase data is limited for cross-origin endpoints unless the
target server exposes timing headers.

The optional local diagnostic companion agent adds local-only DNS, TLS, route,
WiFi, and browser-history context when run by the user. The optional Cloudflare
layer adds remote edge probes, short hosted report links, and a saturation
endpoint; see `docs/cloudflare-remote-vantage.md`.

## Quick Start

```bash
npm install
npm run dev
```

Open the Vite URL, usually `http://localhost:5173`.

## Scripts

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm run test:visual
npm run companion
npm run deploy
```

`npm run test:visual` uses Playwright and starts the Vite dev server from
`playwright.config.ts`.

## Project Map

- `src/lib/engine/` - measurement engine and worker probe logic.
- `src/lib/stores/` - Svelte stores for endpoints, measurements, statistics,
  settings, and UI state.
- `src/lib/components/` - topbar, rail, views, drawers, popovers, and charts.
- `src/lib/share/` - compressed share payload generation and validation.
- `src/lib/remote-vantage/` - Cloudflare edge probe client, report persistence
  client, and browser/remote diagnosis fusion.
- `functions/` - Cloudflare Pages Functions for remote probes, hosted reports,
  health, and saturation downloads.
- `companion/` - optional signed local diagnostic companion agent.
- `src/lib/security/` - URL safety checks for direct and shared endpoints.
- `src/lib/regional-defaults.ts` - region detection and default endpoint sets.
- `tests/unit/` - Vitest unit and component coverage.
- `tests/visual/` - Playwright visual, accessibility, and browser-flow checks.
- `docs/vision/` - product vision and longer-term platform direction.

## Development Notes

- Keep the browser-only measurement limits explicit in UI and docs.
- Treat shared URLs as untrusted input.
- Prefer deterministic sample injection in browser tests over real network
  timing when testing layout or visual state.
- Keep view navigation and keyboard shortcut labels in sync; visible UI should
  never advertise a shortcut that does something else.

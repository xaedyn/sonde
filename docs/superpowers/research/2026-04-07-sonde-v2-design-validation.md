---
date: 2026-04-07
feature: sonde-v2
type: design-validation
---

# Design Validation — Sonde v2

## Acceptance Criteria (from Step 2.5)

AC1: When a user opens Sonde and enters 2+ endpoint URLs, live latency data for all endpoints appears on a synchronized timeline within 5 seconds of starting the test, with each endpoint visually distinguishable by color and accompanied by real-time p50 latency displayed in the summary area.

AC2: When a user tests a URL that returns the `Timing-Allow-Origin` header, the detail panel displays DNS resolution time, TLS handshake time, and TTFB as separate labeled values with a stacked waterfall bar. When the header is absent, the detail panel displays total latency, connection reuse delta, and an explanation — with no empty or broken UI elements.

AC3: When 30+ measurement rounds complete for an endpoint, the summary card displays p50, p95, p99 latency, jitter (standard deviation), and a confidence interval. Before 30 rounds, only raw data points and a "collecting data" indicator are shown.

AC4: When a user clicks the share action after a test, a URL is generated that encodes both the test configuration and result snapshot. When opened in a new browser, it renders the endpoint list and result snapshot without running a new test. URL must be under 8,000 characters for a 5-endpoint, 50-round result set.

AC5: Lighthouse Performance >= 95, Accessibility >= 90. All interactive elements keyboard-reachable. Color encoding passes WCAG AA contrast, verified across protanopia, deuteranopia, and tritanopia.

## Dependency Enumeration

N/A — greenfield, no existing interfaces to enumerate.

## Questions Asked & Answers

### Zero Silent Failures

- **What happens to existing users when this ships?** Ground-up rebuild on a forked repo. No existing Sonde v2 users. Original s80 users unaffected (different repo/URL). Current v1 files replaced entirely by new build output.

- **What happens to existing data?** v1 uses cookie `s80_settings`. v2 uses `localStorage` with versioned schema and different keys. Old cookie is ignored, not corrupted. Users get fresh defaults in v2.

- **What happens to existing integrations?** None exist. Standalone single-page tool with no API, no consumers, no embeds.

- **What's the failure mode if deployment partially succeeds?** Single static file upload (HTML + JS + CSS). No multi-step deployment. Partial upload shows blank page — recoverable by completing upload or rolling back. Standard static hosting behavior.

### Failure at Scale

- **Does this work at 10x (50 endpoints)?** 500 data points/second is well within Canvas 2D capacity (tens of thousands of draw calls per frame). Bottleneck would be Svelte store reactivity — mitigated by batching worker messages and flushing to store on rAF, not per-message. Summary card update interval adjustable (200ms at high endpoint counts). Browser connection pool (6 per host) is the practical limit for same-host URLs — worth documenting in UI.

- **Concurrent operations?** No multi-user, no shared state. Worker onmessage handlers fire sequentially on main thread (event loop guarantee). pendingResponses Set mutation is single-threaded. No race conditions possible.

- **External dependency unavailable?** Tested URLs being unreachable IS the feature. All-unreachable state (user offline) must be an explicitly designed UI state: "All endpoints unreachable — check your network connection." Not a blank canvas.

### Simplest Attack

- **Cheapest abuse vector?** Using Sonde as a DDoS tool. Mitigated: sequential rounds (not parallel floods), per-endpoint request cap, configurable delay. At max speed, one GET per round per endpoint — less traffic than loading a typical webpage. Not a meaningful vector.

- **Auth misconfiguration?** No auth exists. No accounts, sessions, tokens, or API keys. Nothing to misconfigure.

- **Malicious share URLs?** Crafted share URL pre-loads target URLs that recipient's browser fetches. Equivalent to embedding a cross-origin image — GET request with no credentials (no-cors mode), opaque response body never read. Risk is negligible.

- **Internal network probing?** Users can enter private URLs (e.g., `192.168.1.1`). Response is opaque (no data leaked), but latency confirms host reachability. Standard browser behavior, not unique to Sonde. Worth a subtle UI note: "URLs are fetched from your browser — private addresses are accessed from your network."

## Gaps Found

1. **Offline/all-unreachable state not designed.** The validation revealed that when all endpoints are unreachable, the UI must show an explicit state, not a blank canvas. This must be a first-class designed state in the visualization layer.

2. **Internal network note.** The UI should include a subtle indicator that URLs are fetched from the user's local browser/network. Not a security vulnerability, but important for user understanding.

## Fixes Applied

1. **Offline state added to component state requirements.** Section 7.2 of the PSA already requires every component to define empty, loading, active, error, and disabled states. "All endpoints unreachable" is an error state for the VisualizationArea component. This will be specified explicitly in the spec.

2. **Internal network note added to spec scope.** The EndpointPanel component will include a subtle one-line note: "Requests are sent from your browser." This communicates both the privacy model (no server proxy) and the internal network implication without alarming users.

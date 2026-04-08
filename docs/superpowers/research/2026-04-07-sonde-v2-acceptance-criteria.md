---
date: 2026-04-07
feature: sonde-v2
type: acceptance-criteria
---

# Acceptance Criteria — Sonde v2

## AC1: Instant Comparative Diagnosis
When a user opens Sonde and enters 2+ endpoint URLs, live latency data for all endpoints appears on a synchronized timeline within 5 seconds of starting the test, with each endpoint visually distinguishable by color and accompanied by real-time p50 latency displayed in the summary area.

## AC2: Diagnostic Depth (Two-Tier)
When a user tests a URL that returns the `Timing-Allow-Origin` header, the detail panel displays DNS resolution time, TLS handshake time, and TTFB as separate labeled values with a stacked waterfall bar. When the header is absent, the detail panel displays total latency, connection reuse delta (first request vs. subsequent), and an explanation of why sub-field breakdown is unavailable — with no empty or broken UI elements.

## AC3: Statistical Credibility
When 30+ measurement rounds complete for an endpoint, the summary card displays p50, p95, p99 latency, jitter (standard deviation), and a confidence interval — all computed from the full sample set with outliers visible but flagged in the visualization. Before 30 rounds, only raw data points and a "collecting data" indicator are shown (no premature summary statistics).

## AC4: Shareable Results
When a user clicks the share action after a test, a URL is generated that encodes both the test configuration and result snapshot. When that URL is opened in a new browser, it renders the same endpoint list, and the result snapshot is displayed without running a new test. The URL must be under 8,000 characters for a 5-endpoint, 50-round result set.

## AC5: Performance and Accessibility
When Sonde is loaded on a cold cache over a 3G Fast connection, Lighthouse reports Performance >= 95 and Accessibility >= 90. All interactive elements are reachable and operable via keyboard. Color encoding passes WCAG AA contrast against the background surface, verified across protanopia, deuteranopia, and tritanopia simulations.

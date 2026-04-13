# Chronoscope Product Vision — Network Diagnostic Platform

**Date:** 2026-04-11
**Status:** Research complete, ready for prioritization

---

## Executive Summary

Chronoscope is currently a browser-based HTTP latency diagnostic tool. This document outlines the path to becoming a comprehensive, free network diagnostic platform that fills gaps no existing tool addresses — combining capabilities that today require $50k+/year enterprise tools or cobbling together 5-8 separate CLI utilities.

The core insight: **network engineers need one tool that does speed + latency + path + DNS + bufferbloat + loss analysis, produces a shareable interactive report, and looks like it was designed in Cupertino.** Nothing like this exists at any price point. The closest (ThousandEyes) costs $50-200k/year and has a dense enterprise UI.

---

## Architecture: Progressive Enhancement Tiers

Everything flows through the Chronoscope browser UI. The browser is always the front door — this ensures every user touches chronoscope.dev regardless of which tier they're on.

```
┌─────────────────────────────────────────────────────────┐
│                   chronoscope.dev (Browser UI)                │
│                                                         │
│  Tier 0: Browser-only (current + enhancements)          │
│  ┌───────────────────────────────────────────────────┐  │
│  │ HTTP latency, DNS via DoH, bufferbloat,           │  │
│  │ quality score, loss analysis, auto-diagnosis,     │  │
│  │ BGP path via public APIs, shareable reports       │  │
│  └───────────────────────────────────────────────────┘  │
│                                                         │
│  Tier 1: Local agent detected (optional install)        │
│  ┌───────────────────────────────────────────────────┐  │
│  │ Traceroute/mtr, multi-protocol (ICMP/TCP/UDP),    │  │
│  │ TLS chain inspection, WiFi diagnostics,           │  │
│  │ real DNS chain trace, SQLite history               │  │
│  └───────────────────────────────────────────────────┘  │
│                                                         │
│  Tier 2: Community probes (opt-in)                      │
│  ┌───────────────────────────────────────────────────┐  │
│  │ Multi-vantage path comparison, "view from the     │  │
│  │ internet", cross-region diagnostics               │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
         │                              │
    fetch localhost:19100          fetch chronoscope.dev/api
         │                              │
    ┌────▼─────┐                 ┌──────▼──────┐
    │  chronoscope   │                 │  Probe      │
    │  agent   │                 │  Registry   │
    │ (Go bin) │                 │ (CF Worker) │
    └──────────┘                 └─────────────┘
```

**Detection flow:** On load, browser does `fetch('http://127.0.0.1:19100/health')`. If agent responds, Tier 1 features light up. If not, everything in Tier 0 works perfectly. Zero degradation.

---

## Market Gaps We Fill

### Confirmed gaps (no free tool exists)

| Gap | Best existing option | Their problem | Our answer |
|-----|---------------------|---------------|------------|
| Shareable diagnostic report | ThousandEyes snapshots | $50k+/year | Free URL-encoded reports + hosted paste |
| DNS resolution chain visualization | `dig +trace` (CLI) | Terminal wall of text | Visual waterfall with per-step timing |
| Bufferbloat testing | Waveform (limited awareness) | Single server, no history, no sharing | In-browser with grading + shareable results |
| Combined speed+latency+path+DNS | Nothing | Requires 5 tools | One UI, one timeline, correlated |
| "mtr with a web UI" | PingPlotter ($30-350/yr) | Desktop-only, dated UI, no DNS/speed | Browser-first, Glass Lanes aesthetic |
| Auto problem explanation | Nothing | Engineers do this mentally | Deterministic rule engine, plain English |
| Network quality score | Nothing comprehensive | Speedtest shows bandwidth, not quality | Composite score: latency + jitter + loss + DNS + bufferbloat |
| Loss pattern classification | Nothing | Random vs burst vs periodic is manual | Autocorrelation + run-length analysis |

### What engineers literally ask for (Reddit r/networking, r/sysadmin)

- "mtr with a web UI and shareable links"
- "Bufferbloat test I can send to my ISP"
- "One-click network health report I can email to my boss"
- "Speed test that shows if my connection is GOOD, not just FAST"
- "I need to prove it's not my network"
- "Why do I need 5 tools to diagnose one problem?"

---

## Capability Matrix

### Browser-only (no install required)

| Capability | Feasibility | Complexity | Value |
|------------|-------------|------------|-------|
| Network Quality Score | Computational on existing data | 2-3 days | High — single number people understand |
| Packet Loss Pattern Analysis | Statistical analysis of existing data | 3-5 days | High — random vs burst vs periodic |
| Automatic Problem Detection | Deterministic rule engine | 1-2 weeks | Very high — plain English diagnosis |
| DNS Chain via DoH | fetch() to Cloudflare/Google DoH | 1 week | High — visual waterfall, approximate but illustrative |
| Bufferbloat Detection | Concurrent saturation + latency test | 1-1.5 weeks | Very high — fills DSLReports gap |
| BGP/AS Path Display | RIPE RIPEstat + ipinfo.io public APIs | 1 week | Medium — shows network topology |
| Historical Storage (IndexedDB) | Proven browser API, ~20MB/day | 1 week | High — "was it slow yesterday too?" |
| Shareable Reports (enhanced) | Cloudflare KV paste service | 3-4 days | Very high — the #1 requested feature |

### Agent-required (optional install)

| Capability | Feasibility | Complexity | Value |
|------------|-------------|------------|-------|
| Traceroute/mtr | ICMP + TTL, unprivileged on Linux/macOS | 2 weeks | Very high — the original ask |
| Multi-protocol probing | ICMP, TCP connect, UDP, DNS raw | 2-3 weeks | High — differential diagnosis |
| TLS/Cert chain inspection | Go crypto/tls ConnectionState | 1 week | Medium-high — expiry warnings, cipher audit |
| WiFi diagnostics | Platform-specific APIs | 2-3 weeks | Medium — signal, channel, interference |
| Real DNS chain trace | Raw DNS with RD=0, walk referrals | 1 week | High — authoritative resolution chain |
| SQLite history | 30-day retention, ~390MB | 3-4 days | High — reliable long-term storage |

### Infrastructure-required (future)

| Capability | Feasibility | Complexity | Value |
|------------|-------------|------------|-------|
| Community probe network | Central registry on CF Workers | 3-4 weeks | High — multi-vantage comparison |
| Saturation endpoint | Static file on CDN for bufferbloat | 1 day | Required for browser bufferbloat |

---

## What We Cannot Do

Being honest about limits:

- **True traceroute from the browser** — impossible, no TTL control in any browser API
- **TLS introspection from the browser** — no API exists; can only use third-party scan services (SSL Labs) which test from their servers, not yours
- **WiFi diagnostics from the browser** — zero access to radio-layer APIs
- **Raw packet capture (Wireshark-like)** — fundamentally impossible in browser or lightweight agent; would need libpcap, elevated privileges, and massive data handling
- **SNMP device monitoring** — different product category entirely (LibreNMS, Zabbix territory)
- **10,000+ global vantage points** — ThousandEyes/Catchpoint invest millions in colo infrastructure; community probes can approximate but not match

---

## Technical Decisions

### Agent language: Go

- `net` stdlib covers DNS, TCP, UDP, ICMP without dependencies
- `crypto/tls` gives full TLS introspection out of the box
- Single static binary, cross-compiles with `GOOS`/`GOARCH`
- Unprivileged ICMP works on Linux 3.0+ and macOS via `SOCK_DGRAM`
- Precedent: Tailscale, mtr-go, Cloudflare tools all use Go
- Binary size: ~5-8MB (acceptable; smaller with `upx`)

### Agent communication: REST + SSE on localhost

```
GET  /health                          → { version, capabilities }
GET  /mtr?target=8.8.8.8             → SSE stream of hop-by-hop rounds
GET  /dns/trace?name=example.com     → DNS resolution chain with timing
GET  /tls/inspect?host=example.com   → Certificate chain + handshake details
GET  /wifi/status                    → Current WiFi connection details
GET  /wifi/scan                      → Nearby networks + channels
GET  /probes?target=8.8.8.8         → Multi-protocol probe results
```

CORS: `Access-Control-Allow-Origin: https://chronoscope.dev, http://localhost:5173`

### Shareable reports: Cloudflare Workers KV

- Free tier: 100k reads/day, 1k writes/day (more than enough)
- Reports stored with 30-day TTL
- URL: `chronoscope.dev/r/{id}` — opens the browser UI with the report data loaded
- Privacy: reports are unlisted (random ID), not indexed, auto-expire
- Keeps all traffic flowing through chronoscope.dev

### Bufferbloat saturation endpoint

- Host a 25MB file on Cloudflare Pages/R2 (free)
- Browser downloads via multiple parallel `fetch()` streams to saturate
- Concurrent latency measurement via existing Web Workers
- Grade: A (< 5ms increase), B (< 30ms), C (< 60ms), D (< 200ms), F (200ms+)
- Replaces DSLReports' grading methodology

---

## Build Phases

### Phase 1 — Browser enhancements (3-4 weeks)
Pure client-side, no new infrastructure. Ships as updates to chronoscope.dev.

1. **Network Quality Score** — 2-3 days
   - Composite of latency, jitter, loss, DNS speed
   - Display as 0-100 gauge with breakdown
   - Classification: Excellent/Good/Fair/Poor/Bad

2. **Packet Loss Pattern Analysis** — 3-5 days
   - Autocorrelation, run-length analysis, FFT
   - Classify: random, burst, periodic
   - Show in UI as annotated loss timeline

3. **Automatic Problem Detection** — 1-2 weeks
   - Rule engine with 12+ deterministic checks
   - Plain English explanations
   - Severity: info/warning/critical
   - Cross-endpoint correlation ("it's your network" vs "it's the server")

4. **Historical Storage (IndexedDB)** — 1 week
   - Persist samples across sessions
   - Time-range queries for historical views
   - Auto-prune at configurable retention (default 7 days)

### Phase 2 — Browser advanced + infrastructure (4-5 weeks)
Adds new measurement capabilities and the report service.

5. **DNS Chain Visualization via DoH** — 1 week
   - Walk root → TLD → authoritative via Cloudflare DoH
   - Visual waterfall with per-step timing
   - Approximate but educational; agent provides real data later

6. **Bufferbloat Detection** — 1.5 weeks
   - Saturation endpoint (25MB file on CF R2)
   - Concurrent latency measurement during download
   - A-F grading with shareable results

7. **BGP/AS Path Display** — 1 week
   - RIPE RIPEstat API for AS path
   - ipinfo.io for IP → ASN mapping
   - Visual AS path diagram

8. **Enhanced Shareable Reports** — 1 week
   - Cloudflare Workers KV paste service
   - `chronoscope.dev/r/{id}` permalink
   - Include: quality score, diagnosis, timeline, raw data
   - 30-day retention

### Phase 3 — Agent MVP (5-6 weeks)
Go binary, cross-platform, single install.

9. **Agent scaffold** — 1 week
   - HTTP server on localhost:19100
   - Health endpoint, capability discovery
   - Browser detection via fetch on load
   - One-line install (curl | sh, brew install)

10. **Traceroute/mtr** — 2 weeks
    - ICMP with TTL manipulation
    - Continuous rounds like mtr
    - SSE streaming to browser
    - Glass Lanes visualization (one lane per hop)

11. **TLS/Cert Inspection** — 1 week
    - Full chain with expiry warnings
    - Cipher suite, OCSP, CT logs
    - Handshake timing breakdown

12. **Real DNS Chain Trace** — 1 week
    - Raw DNS with RD=0, walk referrals manually
    - Authoritative timing per hop
    - Replaces DoH approximation when agent present

13. **WiFi Diagnostics** — macOS first — 1 week
    - Signal strength, noise, channel, BSSID
    - Nearby network scan for interference
    - Channel utilization map

### Phase 4 — Community + Polish (4+ weeks)

14. **Community Probe Network** — 3-4 weeks
    - Probe registry on CF Workers
    - Opt-in public probe mode for agents
    - Multi-vantage comparison view

15. **Multi-protocol Probing** — 2 weeks
    - ICMP, TCP connect, UDP from agent
    - Side-by-side protocol comparison
    - Differential diagnosis

---

## Competitive Position

```
                        Depth of Analysis
                              ▲
                              │
                 ThousandEyes ●
                  ($50-200k)  │
                              │
                    Kentik ●  │
                   ($24k+)    │
                              │        ┌──────────────┐
                              │        │  Chronoscope       │
                              │        │  (free)      │
                    Catchpoint●        └──────────────┘
                     ($30k+)  │
                              │
              PingPlotter ●   │
               ($30-350)      │
                              │
                              │
    Speedtest ●   SmokePing ● │
     (free)       (free)      │
                              │
    ──────────────────────────┼──────────────────────► Ease of Use
              Hard                              Easy
              (CLI/config)                     (browser)
```

Chronoscope occupies the upper-right quadrant that is currently empty:
**deep analysis + easy to use + free.**

---

## Success Metrics

- **Users:** Track via page loads on chronoscope.dev (all tiers flow through the browser)
- **Agent adoption:** Health check success rate (anonymized count of agent-detected sessions)
- **Report sharing:** Number of reports created via paste service
- **Community probes:** Number of active probes in registry

No accounts, no tracking cookies, no telemetry beyond anonymous page view counts. Privacy-first, consistent with the "tools not services" philosophy.

---

## What This Is Not

- Not a replacement for Wireshark (deep packet inspection)
- Not a replacement for Zabbix/LibreNMS (SNMP device monitoring)
- Not a replacement for Datadog (APM/infrastructure monitoring)
- Not an enterprise SaaS with SSO, audit logs, SLA

This is a **diagnostic tool**, not a monitoring platform. It answers "why is my network slow right now?" and "can I prove it?" — not "alert me when uptime drops below 99.9%."

---

## The Moat

1. **Free forever** — no freemium bait-and-switch
2. **Beautiful UI** — Apple-quality design in a space full of ugly tools
3. **Browser-first** — zero install for 80% of value
4. **Shareable reports** — every diagnosis drives organic traffic to chronoscope.dev
5. **Open source** — trust, community contributions, no vendor lock-in
6. **Progressive enhancement** — agent adds power without requiring it

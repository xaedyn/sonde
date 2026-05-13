# Chronoscope Local Companion Agent

The local companion agent is optional. It runs on loopback only and gives the browser the diagnostics it cannot collect directly: DNS trace, TLS certificate details, route tracing through MTR or traceroute, WiFi signal, and SQLite-backed probe history.

## Start

```bash
npm run companion
```

The agent writes a one-time pairing token to `~/.chronoscope/agent-token.txt`. Paste that token into Chronoscope Settings under `Local Companion`.

Chronoscope only connects to the agent on loopback, normally `http://127.0.0.1:47317`. Health checks are unsigned so the browser can confirm the agent is running. Probe and history requests are signed with the pairing token, timestamp, and nonce.

## Configuration

```bash
CHRONOSCOPE_AGENT_PORT=47317
CHRONOSCOPE_AGENT_SECRET=change-me
CHRONOSCOPE_AGENT_DB="$HOME/.chronoscope/agent-history.sqlite"
CHRONOSCOPE_ALLOWED_ORIGINS="https://chronoscope.dev,http://localhost:5173,http://127.0.0.1:5173"
npm run companion
```

The HTTP server binds to `127.0.0.1` and rejects non-loopback browser configuration. Replayed or stale signed requests are rejected.

## Privacy

WiFi SSID and BSSID are shown only when `Private WiFi` is selected; otherwise they are redacted. Probe history is stored locally in SQLite at `~/.chronoscope/agent-history.sqlite` by default.

## Probe Response Shape

Probe responses group evidence by section: `dns`, `tls`, `route`, and `wifi`. Each section uses the same timed envelope: `ok`, `durationMs`, optional `value`, optional `error`, and optional `unavailable`/`reason`. This lets the app explain which local proof was captured, which proof was unavailable, and how long each local check took without guessing from a generic blob.

## Public Report Privacy

Local-agent evidence stays local by default. Support reports and snapshot links do not include companion probe output unless the sender explicitly enables **Include redacted local proof**.

When included, Chronoscope exports a sanitized local-proof summary only:

- DNS, TLS, route, and WiFi section status, duration, and plain-language detail.
- WiFi signal and noise values when available.
- WiFi SSID and BSSID as `redacted` unless private WiFi was explicitly allowed for that sanitized export path.
- Route/MTR hop counts only; raw hop lines, private gateway addresses, and local hostnames stay out of public reports.
- No SQLite history entries are included in public reports by default.

## What Local Probes Can Prove

- DNS shows what this computer resolved for the target host. It does not prove every resolver or network will resolve the same way.
- TLS shows the certificate and handshake details visible from this computer. It does not prove the remote service is healthy for everyone.
- Route/MTR shows the path tool output available on this device. It can show a local-path clue, but missing hops or blocked probes are common.
- WiFi shows local signal and noise when available. Private SSID and BSSID values stay redacted unless explicitly enabled for the run.
- History shows prior local-agent probes stored on this computer. It is local context, not public report evidence unless explicitly exported in a later flow.

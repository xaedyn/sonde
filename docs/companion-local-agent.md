# Chronoscope Local Companion Agent

The local companion agent is optional. It runs on loopback only and gives the browser the diagnostics it cannot collect directly: DNS trace, TLS certificate details, route tracing through MTR or traceroute, WiFi signal, and SQLite-backed probe history.

## Start

```bash
npm run companion
```

The agent prints a one-time pairing token. Paste that token into Chronoscope Settings under `Local Companion`.

## Configuration

```bash
CHRONOSCOPE_AGENT_PORT=47317
CHRONOSCOPE_AGENT_SECRET=change-me
CHRONOSCOPE_AGENT_DB="$HOME/.chronoscope/agent-history.sqlite"
CHRONOSCOPE_ALLOWED_ORIGINS="https://chronoscope.dev,http://localhost:5173,http://127.0.0.1:5173"
npm run companion
```

The HTTP server binds to `127.0.0.1` and rejects non-loopback browser configuration. Probe and history requests are signed with HMAC-SHA256 using timestamp and nonce headers; replayed or stale requests are rejected.

## Privacy

WiFi SSID and BSSID are shown only when `Private WiFi` is selected; otherwise they are redacted. Probe history is stored locally in SQLite at `~/.chronoscope/agent-history.sqlite` by default.

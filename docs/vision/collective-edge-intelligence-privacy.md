# Collective Edge Intelligence Privacy Contract

Chronoscope may eventually show population-level internet health context from opted-in reports. This feature must stay useful without turning the product into hidden telemetry.

## Consent Rules

- No collection happens without explicit opt-in.
- Users can create, view, and share reports without contributing aggregate data.
- Named public endpoint contribution requires a separate visible consent choice.
- Consent copy must describe the contribution as optional anonymous aggregate evidence.

## Data That Must Not Be Sent

- No full URLs, including paths, queries, fragments, or credentials.
- No local or private hosts, including localhost, `.local`, RFC 1918, loopback, link-local, or unique-local IPv6 targets.
- No WiFi SSID or BSSID values.
- No companion/local-agent browser history or SQLite history.
- No raw IP addresses in public summaries.

## Allowed Aggregate Shape

- Rounded timing buckets such as p50, p95, loss percentage, and sample count.
- Coarse timestamp buckets when needed for trend summaries.
- Public endpoint hostnames only when the user chooses named public endpoint consent.

## Product Boundary

Aggregate context is population-level context, not proof about the current user's path, local DNS resolver, WiFi, ISP, router, or device. The UI must say that plainly wherever aggregate context appears.

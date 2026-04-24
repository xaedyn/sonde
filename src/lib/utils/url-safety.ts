// src/lib/utils/url-safety.ts
// Validation boundary for every URL that reaches fetch() or probe resolution.
//
// Two modes:
// - isSafeProbeUrl:  user-typed URLs. Rejects non-http(s), userinfo, and
//                    over-length input. Still allows RFC1918 / loopback so
//                    "probe my home router" remains a valid use case.
// - isSafeSharedUrl: URLs arriving via share-link payload or localStorage.
//                    Adds the full private/loopback/metadata blocklist —
//                    an untrusted share link must never be able to steer a
//                    victim's browser at 127.0.0.1, 169.254.169.254, etc.

const MAX_URL_LENGTH = 2048;

export function isSafeProbeUrl(input: unknown): boolean {
  return parseSafe(input) !== null;
}

export function isSafeSharedUrl(input: unknown): boolean {
  const parsed = parseSafe(input);
  return parsed !== null && !isPrivateHost(parsed.hostname);
}

function parseSafe(input: unknown): URL | null {
  if (typeof input !== 'string' || input.length === 0 || input.length > MAX_URL_LENGTH) {
    return null;
  }
  let parsed: URL;
  try {
    parsed = new URL(input);
  } catch {
    return null;
  }
  const protocol = parsed.protocol.toLowerCase();
  if (protocol !== 'http:' && protocol !== 'https:') return null;
  // Userinfo in a probe URL is always wrong: legitimate latency probes don't
  // need credentials, and attacker-supplied userinfo is a canonical exfil path.
  if (parsed.username !== '' || parsed.password !== '') return null;
  return parsed;
}

function isPrivateHost(hostname: string): boolean {
  // Strip trailing dot and bracket pair, lowercase for stable comparison.
  const h = hostname.toLowerCase().replace(/\.$/, '');

  // Loopback / zero / metadata / link-local IPv4
  if (h === 'localhost' || h === '0.0.0.0') return true;
  if (h.endsWith('.localhost')) return true;
  if (/^127\./.test(h)) return true;
  if (/^10\./.test(h)) return true;
  if (/^192\.168\./.test(h)) return true;
  if (/^172\.(1[6-9]|2[0-9]|3[01])\./.test(h)) return true;
  if (/^169\.254\./.test(h)) return true; // includes 169.254.169.254 (AWS/Azure/OpenStack IMDS)
  if (/^0\./.test(h)) return true;

  // IPv6 literals arrive bracketed: [::1], [fc00::], [fe80::], [::ffff:127.0.0.1]
  const stripped = h.startsWith('[') && h.endsWith(']') ? h.slice(1, -1) : h;
  if (stripped === '::1' || stripped === '::' || stripped === '0:0:0:0:0:0:0:1') return true;
  if (/^fc[0-9a-f]{2}:/.test(stripped)) return true; // fc00::/7 unique local
  if (/^fd[0-9a-f]{2}:/.test(stripped)) return true;
  if (/^fe[89ab][0-9a-f]:/.test(stripped)) return true; // fe80::/10 link-local
  // IPv4-mapped IPv6. WHATWG normalizes ::ffff:127.0.0.1 to the hex form
  // ::ffff:7f00:1, so match on that and reconstruct the embedded IPv4.
  const v4mapped = stripped.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (v4mapped && v4mapped[1] !== undefined && v4mapped[2] !== undefined) {
    const hi = parseInt(v4mapped[1], 16);
    const lo = parseInt(v4mapped[2], 16);
    const a = (hi >> 8) & 0xff;
    const b = hi & 0xff;
    const c = (lo >> 8) & 0xff;
    const d = lo & 0xff;
    if (isPrivateHost(`${a}.${b}.${c}.${d}`)) return true;
  }

  // mDNS / corporate internal TLDs
  return h.endsWith('.local') || h.endsWith('.internal');
}

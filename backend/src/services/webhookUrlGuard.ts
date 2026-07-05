// backend/src/services/webhookUrlGuard.ts
// Outbound SSRF guard for webhook target URLs.
//
// Policy (documented deliberately):
//   - Scheme MUST be http or https. Anything else (file:, gopher:, ftp:, etc.)
//     is rejected outright.
//   - ALWAYS BLOCK loopback (localhost, 127.0.0.0/8, ::1), the unspecified
//     address (0.0.0.0, ::), and link-local / cloud-metadata ranges
//     (169.254.0.0/16 incl. 169.254.169.254, IPv6 fe80::/10). These are never
//     legitimate webhook destinations and are the classic SSRF pivots.
//   - LOG-BUT-ALLOW RFC1918 / unique-local private ranges (10/8, 172.16-31/12,
//     192.168/16, fc00::/7). Internal chat webhooks (self-hosted Mattermost,
//     etc.) commonly live on private networks, so blocking these outright would
//     break legitimate use. We surface a warning instead.
//   - Hostnames that are not IP literals are allowed as-is. NOTE: this guard
//     inspects only the literal URL; it does not resolve DNS, so a hostname that
//     resolves to an internal IP (DNS-rebinding style) is not caught here. That
//     is an accepted limitation of a synchronous, unit-testable string guard.

export interface WebhookUrlCheck {
  /** Whether the URL is permitted to be fetched. */
  allowed: boolean;
  /** Human-readable reason the URL was blocked (only when allowed === false). */
  reason?: string;
  /** Non-fatal note (e.g. private range) worth logging (only when allowed === true). */
  warning?: string;
}

/** Parse a dotted-quad IPv4 string into four octets, or null if not IPv4. */
function parseIPv4(host: string): [number, number, number, number] | null {
  const parts = host.split('.');
  if (parts.length !== 4) return null;
  const octets: number[] = [];
  for (const part of parts) {
    // Reject empty, non-numeric, and leading-zero forms.
    if (!/^\d{1,3}$/.test(part)) return null;
    const n = Number(part);
    if (n > 255) return null;
    octets.push(n);
  }
  return [octets[0], octets[1], octets[2], octets[3]];
}

/** Classify an IPv4 address: 'block', 'warn' (private), or 'allow'. */
function classifyIPv4(octets: [number, number, number, number]): 'block' | 'warn' | 'allow' {
  const [a, b] = octets;

  // Always block: loopback, unspecified/this-host, link-local (incl. metadata).
  if (a === 127) return 'block'; // 127.0.0.0/8 loopback
  if (a === 0) return 'block'; // 0.0.0.0/8 "this host"
  if (a === 169 && b === 254) return 'block'; // 169.254.0.0/16 link-local + 169.254.169.254 metadata

  // Log-but-allow: RFC1918 private ranges.
  if (a === 10) return 'warn'; // 10.0.0.0/8
  if (a === 172 && b >= 16 && b <= 31) return 'warn'; // 172.16.0.0/12
  if (a === 192 && b === 168) return 'warn'; // 192.168.0.0/16

  return 'allow';
}

/** Classify an IPv6 host (already unbracketed). Returns null if not IPv6. */
function classifyIPv6(host: string): 'block' | 'warn' | 'allow' | null {
  if (!host.includes(':')) return null;
  const lower = host.toLowerCase();

  // IPv4-mapped addresses (::ffff:a.b.c.d). Node normalizes the dotted form to
  // hex hextets (e.g. ::ffff:127.0.0.1 -> ::ffff:7f00:1), so decode both.
  if (lower.startsWith('::ffff:')) {
    const rest = lower.slice('::ffff:'.length);
    if (rest.includes('.')) {
      const v4 = parseIPv4(rest);
      if (v4) return classifyIPv4(v4);
    } else {
      const groups = rest.split(':');
      if (groups.length === 2 && groups.every((g) => /^[0-9a-f]{1,4}$/.test(g))) {
        const hi = parseInt(groups[0], 16);
        const lo = parseInt(groups[1], 16);
        const v4: [number, number, number, number] = [
          (hi >> 8) & 0xff,
          hi & 0xff,
          (lo >> 8) & 0xff,
          lo & 0xff,
        ];
        return classifyIPv4(v4);
      }
    }
  }

  // Loopback and unspecified.
  if (lower === '::1' || lower === '::') return 'block';

  // Link-local fe80::/10 (fe80..febf) — analogous to IPv4 169.254, block.
  if (/^fe[89ab]/.test(lower)) return 'block';

  // Unique-local fc00::/7 (fc.. / fd..) — private, log-but-allow.
  if (/^f[cd]/.test(lower)) return 'warn';

  return 'allow';
}

/**
 * Evaluate whether a webhook target URL is safe to fetch. Pure and synchronous
 * so it can be unit-tested and applied both on the API route and in the service.
 */
export function checkWebhookUrl(rawUrl: string): WebhookUrlCheck {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return { allowed: false, reason: 'Webhook URL is missing' };
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { allowed: false, reason: 'Webhook URL is not a valid URL' };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return {
      allowed: false,
      reason: `Unsupported URL scheme "${parsed.protocol}"; only http and https are allowed`,
    };
  }

  // Node's URL#hostname keeps the surrounding brackets on IPv6 literals
  // (e.g. "[::1]"); strip them so classification sees the bare address.
  let host = parsed.hostname.toLowerCase();
  if (host.startsWith('[') && host.endsWith(']')) {
    host = host.slice(1, -1);
  }

  if (host === 'localhost' || host.endsWith('.localhost')) {
    return { allowed: false, reason: 'Webhook URL targets localhost' };
  }

  const v4 = parseIPv4(host);
  if (v4) {
    const verdict = classifyIPv4(v4);
    if (verdict === 'block') {
      return { allowed: false, reason: `Webhook URL targets a blocked address (${host})` };
    }
    if (verdict === 'warn') {
      return { allowed: true, warning: `Webhook URL targets a private address (${host})` };
    }
    return { allowed: true };
  }

  const v6 = classifyIPv6(host);
  if (v6 === 'block') {
    return { allowed: false, reason: `Webhook URL targets a blocked address (${host})` };
  }
  if (v6 === 'warn') {
    return { allowed: true, warning: `Webhook URL targets a private address (${host})` };
  }

  return { allowed: true };
}

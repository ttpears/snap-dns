// backend/src/services/dnsSafety.ts
// Injection guards for DNS command execution.
//
// nsupdate reads a newline-delimited command file and dig/nsupdate receive the
// zone, server and TSIG material as arguments. Untrusted request data flows into
// both, so before any of it is written to an update file or passed to a command
// we enforce that it cannot smuggle extra directives (a raw newline starts a new
// `update`/`send`) or split a single token into several (embedded whitespace).
// These checks are intentionally a security floor, not full per-type validation
// (that lives in validationService) — they must never reject data that is legal
// DNS presentation format.

// C0 controls plus DEL. RFC 1035 presentation format encodes control octets as
// \DDD escapes, never as literal bytes, so rejecting literal controls never
// rejects legitimate presentation data.
// eslint-disable-next-line no-control-regex -- matching control bytes is the point
const CONTROL_CHARS = /[\x00-\x1f\x7f]/;

// A single presentation-format label: letters, digits, hyphen, underscore.
const LABEL = /^[A-Za-z0-9_-]+$/;

/**
 * Throw if a string contains a control character. This is the core defence
 * against nsupdate command-file injection: a literal newline in any field
 * interpolated into the update file would begin a new nsupdate directive.
 */
export function assertNoControlChars(value: string, field: string): void {
  if (typeof value !== 'string' || CONTROL_CHARS.test(value)) {
    throw new Error(`Illegal control character in ${field}`);
  }
}

/**
 * RFC 1035 §2.3.1/§3.1 owner-name syntax check. Permissive enough for the
 * presentation forms this app accepts — apex shorthand (@), the root (.),
 * a leftmost wildcard (*), underscore service labels, and a trailing dot — but
 * strict enough that a name can never contain whitespace or control characters
 * that would split or inject nsupdate directives.
 */
export function isValidDnsName(name: string): boolean {
  if (typeof name !== 'string' || name.length === 0 || name.length > 255) return false;
  if (CONTROL_CHARS.test(name)) return false;
  if (name === '@' || name === '.') return true;

  const bare = name.endsWith('.') ? name.slice(0, -1) : name;
  if (bare.length === 0) return false;

  const labels = bare.split('.');
  for (let i = 0; i < labels.length; i++) {
    const label = labels[i];
    if (label.length === 0 || label.length > 63) return false;
    if (label === '*' && i === 0) continue; // wildcard is valid only as the leftmost label
    if (!LABEL.test(label)) return false;
  }
  return true;
}

/**
 * Zone-name syntax check. Stricter than isValidDnsName: a zone is always a
 * concrete domain, so apex shorthand and wildcards are rejected.
 */
export function isValidZoneName(zone: string): boolean {
  if (typeof zone !== 'string' || zone.length === 0 || zone.length > 255) return false;
  if (CONTROL_CHARS.test(zone)) return false;

  const bare = zone.endsWith('.') ? zone.slice(0, -1) : zone;
  if (bare.length === 0) return false;

  const labels = bare.split('.');
  for (const label of labels) {
    if (label.length === 0 || label.length > 63) return false;
    if (!LABEL.test(label)) return false;
  }
  return true;
}

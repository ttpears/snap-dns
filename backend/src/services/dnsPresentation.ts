// backend/src/services/dnsPresentation.ts
// RFC 1035 §5.1 presentation format for TXT character-strings.
//
// TXT RDATA is one or more <character-string>s; the logical value is their
// ordered concatenation (RFC 1035 §3.3.14, RFC 7208 §3.3 for SPF). This module
// is the single place where presentation quoting is added or removed, so a value
// is quoted exactly once — at the nsupdate boundary — and never double-quoted or
// left split across the pipeline.

/**
 * Parse TXT RDATA as `dig` prints it (space-separated quoted character-strings,
 * e.g. `"v=spf1" " -all"`) into the single unquoted logical value. Handles \",
 * \\ and \DDD escapes and preserves whitespace inside a quoted string. Bare
 * unquoted tokens are accepted for robustness.
 */
export function parseTxtRdata(rdata: string): string {
  const segments: string[] = [];
  let i = 0;
  const n = rdata.length;

  while (i < n) {
    while (i < n && /\s/.test(rdata[i])) i++; // skip separators between strings
    if (i >= n) break;

    if (rdata[i] === '"') {
      i++; // consume opening quote
      let seg = '';
      while (i < n && rdata[i] !== '"') {
        if (rdata[i] === '\\') {
          i++;
          if (i >= n) break;
          const rest = rdata.slice(i, i + 3);
          if (/^[0-9]{3}$/.test(rest)) {
            seg += String.fromCharCode(parseInt(rest, 10)); // \DDD decimal escape
            i += 3;
          } else {
            seg += rdata[i]; // \" \\ or any other escaped char → literal
            i++;
          }
        } else {
          seg += rdata[i++];
        }
      }
      i++; // consume closing quote
      segments.push(seg);
    } else {
      let seg = '';
      while (i < n && !/\s/.test(rdata[i])) seg += rdata[i++];
      segments.push(seg);
    }
  }

  return segments.join('');
}

/**
 * Quote an unquoted TXT value (string, or already-chunked string[]) into
 * presentation character-string(s) for an nsupdate command file. Escapes
 * backslash first, then double-quote (RFC 1035 §5.1).
 */
export function quoteTxtValue(value: string | string[]): string {
  const segments = Array.isArray(value) ? value : [value];
  return segments
    .map(seg => `"${String(seg).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`)
    .join(' ');
}

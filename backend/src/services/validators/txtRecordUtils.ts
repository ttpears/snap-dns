// backend/src/services/validators/txtRecordUtils.ts
// Pure utilities for handling plain TXT record values: cleaning user/wire-format
// input, chunking values into ≤255-byte segments, and producing wire-format previews.

const MAX_SEGMENT_BYTES = 255;

/**
 * Clean a TXT value loaded from the backend or typed by a user.
 * - Joins multi-string arrays (RFC behavior: TXT strings concatenate at the wire level).
 * - Unescapes \" sequences, then strips all remaining quotes and backslashes.
 * - Strips newlines and carriage returns (TXT records cannot contain them).
 *
 * Returns a single logical text string suitable for editing in a textarea.
 */
export function cleanTxtValue(value: string | string[]): string {
  if (Array.isArray(value)) {
    return value.map(cleanSegment).join('');
  }
  return cleanSegment(value);
}

function cleanSegment(segment: string): string {
  if (typeof segment !== 'string') return '';
  return segment
    .replace(/\\"/g, '"')   // unescape \" → "
    .replace(/["\\]/g, '')  // strip all quotes and backslashes
    .replace(/[\r\n]/g, ''); // strip newlines
}

/**
 * Returns the UTF-8 byte length of a string without relying on TextEncoder.
 * Each code point uses 1–4 bytes depending on its value.
 */
function utf8ByteLength(str: string): number {
  let len = 0;
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    if (code <= 0x7f) {
      len += 1;
    } else if (code <= 0x7ff) {
      len += 2;
    } else if (code >= 0xd800 && code <= 0xdbff) {
      // Surrogate pair — two UTF-16 code units encode one supplementary character (4 bytes).
      len += 4;
      i++; // skip the low surrogate
    } else {
      len += 3;
    }
  }
  return len;
}

/**
 * Split a cleaned text string into ≤255-byte UTF-8 segments.
 * - Returns the original string if it fits in one segment.
 * - Otherwise returns an array of segments.
 * - Never splits a multi-byte UTF-8 character across segments.
 */
export function chunkTxtValue(cleaned: string): string | string[] {
  if (utf8ByteLength(cleaned) <= MAX_SEGMENT_BYTES) {
    return cleaned;
  }

  const chunks: string[] = [];
  let start = 0;

  while (start < cleaned.length) {
    let byteCount = 0;
    let end = start;

    while (end < cleaned.length) {
      const code = cleaned.charCodeAt(end);
      let charBytes: number;

      if (code <= 0x7f) {
        charBytes = 1;
      } else if (code <= 0x7ff) {
        charBytes = 2;
      } else if (code >= 0xd800 && code <= 0xdbff) {
        charBytes = 4; // surrogate pair
      } else {
        charBytes = 3;
      }

      if (byteCount + charBytes > MAX_SEGMENT_BYTES) break;

      byteCount += charBytes;
      end += (charBytes === 4) ? 2 : 1; // surrogate pair = 2 UTF-16 code units
    }

    chunks.push(cleaned.slice(start, end));
    start = end;
  }

  return chunks;
}

/**
 * Build a human-readable wire-format preview of a TXT value.
 * Each segment is wrapped in quotes; multi-segment values are joined by spaces.
 */
export function serializeTxtForPreview(value: string | string[]): string {
  if (Array.isArray(value)) {
    if (value.length === 0) return '""';
    return value.map(s => `"${s}"`).join(' ');
  }
  return `"${value}"`;
}

/**
 * Returns true if the raw value contains characters that cleanTxtValue would
 * strip or transform. Used to set the "wasHealed" flag on load.
 */
export function isTxtValueDirty(raw: string | string[]): boolean {
  if (Array.isArray(raw)) {
    return raw.some(isTxtValueDirty);
  }
  if (typeof raw !== 'string') return false;
  return /["\\\r\n]/.test(raw);
}

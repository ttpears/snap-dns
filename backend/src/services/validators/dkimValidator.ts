// backend/src/services/validators/dkimValidator.ts
import { TxtValidationResult } from './types';

const BASE64_RE = /^[A-Za-z0-9+/]*={0,2}$/;

export function validateDkim(value: string): TxtValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Parse semicolon-separated tags
  const rawTags = value.split(';').map(t => t.trim()).filter(Boolean);
  const tags = new Map<string, string>();

  for (const raw of rawTags) {
    const eqIndex = raw.indexOf('=');
    if (eqIndex === -1) {
      errors.push(`Malformed tag: "${raw}" (missing "=" sign)`);
      continue;
    }
    const key = raw.substring(0, eqIndex).trim();
    const val = raw.substring(eqIndex + 1).trim();
    tags.set(key, val);
  }

  // RFC 6376 §3.6.1: the v= tag is RECOMMENDED, not required. If present it must
  // be DKIM1; its absence is not an error.
  const vTag = tags.get('v');
  if (vTag !== undefined && vTag.toUpperCase() !== 'DKIM1') {
    errors.push('DKIM v= tag, if present, must be "DKIM1"');
  }

  // p= tag required
  if (!tags.has('p')) {
    errors.push('DKIM record must contain a "p=" public key tag');
  } else {
    const pValue = tags.get('p')!;
    if (pValue === '') {
      warnings.push('Empty p= tag indicates a revocation record (key has been revoked)');
    } else {
      // Validate base64 (strip whitespace first)
      const stripped = pValue.replace(/\s/g, '');
      if (!BASE64_RE.test(stripped)) {
        errors.push('Public key (p=) must be valid base64');
      }
    }
  }

  return { errors, warnings };
}

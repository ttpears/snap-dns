// src/services/validators/dmarcValidator.ts
import { TxtValidationResult } from './types';

const VALID_POLICIES = ['none', 'quarantine', 'reject'];
const VALID_ALIGNMENT = ['r', 's'];

function parseTags(value: string, errors: string[]): Map<string, string> {
  const tags = new Map<string, string>();
  const parts = value.split(';').map(s => s.trim()).filter(Boolean);
  for (const part of parts) {
    const eqIdx = part.indexOf('=');
    if (eqIdx < 1) {
      errors.push(`Malformed DMARC tag: "${part}" (expected "key=value" format)`);
      continue;
    }
    const key = part.slice(0, eqIdx).trim().toLowerCase();
    const val = part.slice(eqIdx + 1).trim();
    tags.set(key, val);
  }
  return tags;
}

export function validateDmarc(value: string): TxtValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const tags = parseTags(value, errors);

  // Check v=DMARC1
  const version = tags.get('v');
  if (!version || version.toUpperCase() !== 'DMARC1') {
    errors.push('DMARC record must start with "v=DMARC1"');
  }

  // Check p= tag
  const policy = tags.get('p');
  if (!policy) {
    errors.push('DMARC record must include a p= (policy) tag');
  } else if (!VALID_POLICIES.includes(policy.toLowerCase())) {
    errors.push(`Invalid DMARC policy "${policy}": must be none, quarantine, or reject`);
  }

  // Check sp= if present
  const sp = tags.get('sp');
  if (sp !== undefined && !VALID_POLICIES.includes(sp.toLowerCase())) {
    errors.push(`Invalid subdomain policy (sp=) "${sp}": must be none, quarantine, or reject`);
  }

  // Check pct= if present
  const pct = tags.get('pct');
  if (pct !== undefined) {
    const pctNum = Number(pct);
    if (isNaN(pctNum) || pctNum < 0 || pctNum > 100 || !Number.isInteger(pctNum)) {
      errors.push(`Invalid pct= value "${pct}": must be an integer between 0 and 100`);
    } else if (pctNum < 100) {
      warnings.push(`pct=${pct} means the DMARC policy applies to only ${pct}% of messages`);
    }
  }

  // Check adkim= if present
  const adkim = tags.get('adkim');
  if (adkim !== undefined && !VALID_ALIGNMENT.includes(adkim.toLowerCase())) {
    errors.push(`Invalid adkim= value "${adkim}": must be r (relaxed) or s (strict)`);
  }

  // Check aspf= if present
  const aspf = tags.get('aspf');
  if (aspf !== undefined && !VALID_ALIGNMENT.includes(aspf.toLowerCase())) {
    errors.push(`Invalid aspf= value "${aspf}": must be r (relaxed) or s (strict)`);
  }

  // Warn on p=none without rua
  if (policy && policy.toLowerCase() === 'none' && !tags.has('rua')) {
    warnings.push('p=none without rua= means you won\'t receive aggregate reports; consider adding rua=mailto:...');
  }

  return { errors, warnings };
}

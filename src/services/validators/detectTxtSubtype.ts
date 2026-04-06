// src/services/validators/detectTxtSubtype.ts
export type TxtSubtype = 'spf' | 'dkim' | 'dmarc';

export function detectTxtSubtype(value: string, recordName?: string): TxtSubtype | null {
  const lower = value.toLowerCase().trim();

  // SPF: must start with v=spf1
  if (lower.startsWith('v=spf1')) {
    return 'spf';
  }

  // DMARC: starts with v=DMARC1 or record name is _dmarc
  if (lower.startsWith('v=dmarc1')) {
    return 'dmarc';
  }
  if (recordName && recordName.toLowerCase() === '_dmarc') {
    return 'dmarc';
  }

  // DKIM: contains v=DKIM1 or record name contains _domainkey
  if (lower.includes('v=dkim1')) {
    return 'dkim';
  }
  if (recordName && recordName.toLowerCase().includes('_domainkey')) {
    return 'dkim';
  }

  return null;
}

// backend/src/services/validators/spfValidator.ts
import { TxtValidationResult } from './types';

const KNOWN_MECHANISMS = new Set(['all', 'ip4', 'ip6', 'a', 'mx', 'include', 'exists', 'ptr']);
const DNS_LOOKUP_MECHANISMS = new Set(['include', 'a', 'mx', 'ptr', 'exists']);

function isValidIPv4(addr: string): boolean {
  const parts = addr.split('.');
  if (parts.length !== 4) return false;
  return parts.every(p => {
    const n = Number(p);
    return /^\d{1,3}$/.test(p) && n >= 0 && n <= 255;
  });
}

function isValidIPv6(addr: string): boolean {
  // Handle :: shorthand
  if (addr === '::') return true;
  const doubleColonCount = (addr.match(/::/g) || []).length;
  if (doubleColonCount > 1) return false;

  const expanded = addr.split('::');
  if (expanded.length > 2) return false;

  const groups: string[] = [];
  if (doubleColonCount === 1) {
    const left = expanded[0] ? expanded[0].split(':') : [];
    const right = expanded[1] ? expanded[1].split(':') : [];
    const missing = 8 - left.length - right.length;
    if (missing < 0) return false;
    groups.push(...left, ...Array(missing).fill('0'), ...right);
  } else {
    groups.push(...addr.split(':'));
  }

  if (groups.length !== 8) return false;
  return groups.every(g => /^[0-9a-fA-F]{1,4}$/.test(g));
}

export function validateSpf(value: string): TxtValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const trimmed = value.trim();

  // Check v=spf1 prefix (case-insensitive)
  if (!trimmed.toLowerCase().startsWith('v=spf1')) {
    errors.push('SPF record must start with "v=spf1"');
    return { errors, warnings };
  }

  const tokens = trimmed.split(/\s+/).slice(1); // skip v=spf1
  const seen = new Set<string>();
  let dnsLookupCount = 0;

  for (const token of tokens) {
    // Strip qualifier (+, -, ~, ?)
    let qualified = token;
    let qualifier = '+';
    if (/^[+\-~?]/.test(token)) {
      qualifier = token[0];
      qualified = token.slice(1);
    }

    // Split mechanism:value
    const colonIdx = qualified.indexOf(':');
    const mechanism = colonIdx >= 0 ? qualified.substring(0, colonIdx).toLowerCase() : qualified.toLowerCase();
    const arg = colonIdx >= 0 ? qualified.substring(colonIdx + 1) : undefined;

    if (!KNOWN_MECHANISMS.has(mechanism)) {
      errors.push(`Unknown mechanism: "${mechanism}"`);
      continue;
    }

    // Check duplicates (use the full token minus qualifier for comparison)
    const canonical = qualified.toLowerCase();
    if (seen.has(canonical)) {
      errors.push(`Duplicate mechanism: "${qualified}"`);
    }
    seen.add(canonical);

    // Count DNS lookups
    if (DNS_LOOKUP_MECHANISMS.has(mechanism)) {
      dnsLookupCount++;
    }

    // Validate ip4
    if (mechanism === 'ip4' && arg) {
      const [addr, cidrStr] = arg.split('/');
      if (!isValidIPv4(addr)) {
        errors.push(`Invalid IPv4 address: "${addr}"`);
      }
      if (cidrStr !== undefined) {
        const cidr = Number(cidrStr);
        if (isNaN(cidr) || cidr < 0 || cidr > 32) {
          errors.push(`Invalid IPv4 CIDR prefix: /${cidrStr} (must be 0-32)`);
        }
      }
    }

    // Validate ip6
    if (mechanism === 'ip6' && arg) {
      const cidrMatch = arg.match(/^(.+?)\/(\d+)$/);
      let addr = arg;
      let cidrStr: string | undefined;
      if (cidrMatch) {
        addr = cidrMatch[1];
        cidrStr = cidrMatch[2];
      }
      if (!isValidIPv6(addr)) {
        errors.push(`Invalid IPv6 address: "${addr}"`);
      }
      if (cidrStr !== undefined) {
        const cidr = Number(cidrStr);
        if (isNaN(cidr) || cidr < 0 || cidr > 128) {
          errors.push(`Invalid IPv6 CIDR prefix: /${cidrStr} (must be 0-128)`);
        }
      }
    }

    // Warnings
    if (mechanism === 'all' && (qualifier === '+' || token === 'all')) {
      warnings.push('Using "+all" allows any server to send mail for this domain');
    }

    if (mechanism === 'ptr') {
      warnings.push('The "ptr" mechanism is deprecated (RFC 7208) and may cause issues');
    }
  }

  if (dnsLookupCount > 10) {
    warnings.push(`SPF record requires ${dnsLookupCount} DNS lookups, exceeding the 10 lookup limit`);
  }

  return { errors, warnings };
}

// backend/src/services/validationService.ts
// Server-side validation for DNS records

import { detectTxtSubtype } from './validators/detectTxtSubtype';
import { validateSpf } from './validators/spfValidator';
import { validateDkim } from './validators/dkimValidator';
import { validateDmarc } from './validators/dmarcValidator';

interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

class ValidationService {
  // IANA CAA property registry (RFC 8659 + registered extensions). Well-formed
  // tags outside this set are allowed with a warning, not rejected.
  private static readonly CAA_KNOWN_TAGS = new Set([
    'issue', 'issuewild', 'iodef', 'contactemail', 'contactphone', 'issuevmc', 'issuewildvmc',
  ]);

  /**
   * Validate a DNS record
   */
  validateRecord(record: any, _zone: string): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Validate required fields
    if (!record) {
      errors.push('Record data is required');
      return { isValid: false, errors, warnings };
    }

    if (!record.name) {
      errors.push('Record name is required');
    }

    if (!record.type) {
      errors.push('Record type is required');
    }

    if (record.value === undefined || record.value === null || record.value === '') {
      errors.push('Record value is required');
    }

    // TTL 0 is valid (RFC 2181 §8: "no caching"); only a missing value is an
    // error, not a falsy 0.
    if (record.ttl === undefined || record.ttl === null || record.ttl === '') {
      errors.push('TTL is required');
    } else if (record.ttl < 0 || record.ttl > 2147483647) {
      errors.push('TTL must be between 0 and 2147483647');
    }

    // Type-specific validation
    if (record.type) {
      this.validateRecordType(record, errors, warnings);
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Validate record based on type
   */
  private validateRecordType(record: any, errors: string[], warnings: string[]): void {
    switch (record.type) {
      case 'A':
        if (!this.isValidIPv4(record.value)) {
          errors.push('Invalid IPv4 address format');
        }
        break;

      case 'AAAA':
        if (!this.isValidIPv6(record.value)) {
          errors.push('Invalid IPv6 address format');
        }
        break;

      case 'CNAME':
      case 'NS':
      case 'PTR':
      case 'DNAME':
        if (!this.isValidHostname(record.value)) {
          errors.push(`Invalid ${record.type} target format`);
        }
        break;

      case 'MX':
        if (!this.isValidMX(record.value)) {
          errors.push('Invalid MX record format (should be: priority hostname)');
        }
        break;

      case 'TXT': {
        if (typeof record.value !== 'string' && !Array.isArray(record.value)) {
          errors.push('Invalid TXT record format');
          break;
        }

        const segments: string[] = Array.isArray(record.value)
          ? (record.value as string[])
          : [record.value as string];

        // Structural limits apply to every character-string regardless of
        // subtype. Quotes and backslashes are legal TXT data (a value may
        // contain them); they are escaped exactly once at the nsupdate boundary,
        // not rejected here. Control characters are never legal.
        for (const seg of segments) {
          if (typeof seg !== 'string') {
            errors.push('TXT record segments must be strings');
            continue;
          }
          if (Buffer.byteLength(seg, 'utf8') > 255) {
            errors.push(
              `TXT record segment exceeds 255 bytes (${Buffer.byteLength(seg, 'utf8')} bytes)`
            );
          }
          // eslint-disable-next-line no-control-regex
          if (/[\x00-\x1F\x7F]/.test(seg)) {
            errors.push('TXT record segments must not contain control characters');
          }
        }

        // Additionally apply SPF/DKIM/DMARC semantics to the concatenated value.
        const joined = segments.join('');
        const subtype = detectTxtSubtype(joined, record.name);
        if (subtype) {
          const validator = subtype === 'spf' ? validateSpf
            : subtype === 'dkim' ? validateDkim
            : validateDmarc;
          const result = validator(joined);
          errors.push(...result.errors);
          warnings.push(...result.warnings);
        }
        break;
      }

      case 'SRV':
        if (!this.isValidSRV(record.value)) {
          errors.push('Invalid SRV record format (should be: priority weight port target)');
        }
        break;

      case 'CAA':
        this.validateCAA(record.value, errors, warnings);
        break;

      case 'DS':
      case 'CDS':
        if (!this.isValidDS(record.value)) {
          errors.push(`Invalid ${record.type} record format (should be: key-tag algorithm digest-type digest-hex)`);
        }
        break;

      case 'TLSA':
      case 'SMIMEA':
        if (!this.isValidTLSA(record.value)) {
          errors.push(`Invalid ${record.type} record format (should be: usage selector matching-type certificate-hex)`);
        }
        break;

      case 'SOA':
        // SOA validation is complex, validate basic structure
        if (typeof record.value === 'object') {
          if (!record.value.mname || !record.value.rname) {
            errors.push('SOA record must have mname and rname');
          }
        }
        break;
    }
  }

  /**
   * Validate IPv4 address
   */
  private isValidIPv4(ip: string): boolean {
    const parts = ip.split('.');
    if (parts.length !== 4) return false;
    return parts.every(part => {
      if (!/^\d{1,3}$/.test(part)) return false;
      // Reject leading zeros (192.168.001.1): ambiguous octal-vs-decimal.
      if (part.length > 1 && part[0] === '0') return false;
      const num = parseInt(part, 10);
      return num >= 0 && num <= 255;
    });
  }

  /**
   * Validate IPv6 address (comprehensive)
   */
  private isValidIPv6(ip: string): boolean {
    // Handles full, compressed (::), and embedded-IPv4 forms in any position
    // (::ffff:192.0.2.1, 64:ff9b::1.2.3.4). An embedded dotted-quad may only be
    // the final element and counts as two 16-bit groups (RFC 4291 §2.2).
    ip = ip.trim();
    if (ip.length === 0) return false;

    const parts = ip.split('::');
    if (parts.length > 2) return false; // at most one "::"
    const compressed = parts.length === 2;

    const groupCount = (segment: string): number | null => {
      if (segment === '') return 0;
      const groups = segment.split(':');
      let count = 0;
      for (let i = 0; i < groups.length; i++) {
        const g = groups[i];
        if (g.includes('.')) {
          if (i !== groups.length - 1) return null; // IPv4 only as the last element
          if (!this.isValidIPv4(g)) return null;
          count += 2;
        } else {
          if (!/^[0-9a-f]{1,4}$/i.test(g)) return null;
          count += 1;
        }
      }
      return count;
    };

    if (compressed) {
      const left = groupCount(parts[0]);
      const right = groupCount(parts[1]);
      if (left === null || right === null) return false;
      return left + right < 8; // "::" stands in for at least one group
    }

    return groupCount(ip) === 8;
  }

  /**
   * Validate hostname
   */
  private isValidHostname(hostname: string): boolean {
    if (!hostname || hostname === '@') return true;

    // RFC 1035 §2.3.4: a domain name is at most 255 octets.
    if (hostname.length > 255) return false;

    // Bare wildcard at the zone apex (RFC 4592).
    if (hostname === '*') return true;

    // Allow wildcards
    if (hostname.startsWith('*.')) {
      hostname = hostname.substring(2);
    }

    // Allow underscores for special records
    const regex = /^[a-zA-Z0-9_]([a-zA-Z0-9_-]{0,61}[a-zA-Z0-9_])?(\.[a-zA-Z0-9_]([a-zA-Z0-9_-]{0,61}[a-zA-Z0-9_])?)*\.?$/;
    return regex.test(hostname);
  }

  // Digits only (parseInt would accept "10x"/"1.5"), 0..65535.
  private isValidUint16(token: string): boolean {
    if (!/^\d+$/.test(token)) return false;
    const num = parseInt(token, 10);
    return num >= 0 && num <= 65535;
  }

  private isValidUint8(token: string): boolean {
    if (!/^\d+$/.test(token)) return false;
    const num = parseInt(token, 10);
    return num >= 0 && num <= 255;
  }

  // DS/CDS: key-tag(uint16) algorithm(uint8) digest-type(uint8) digest(hex).
  private isValidDS(value: string): boolean {
    if (typeof value !== 'string') return false;
    const parts = value.trim().split(/\s+/);
    if (parts.length < 4) return false;
    const digest = parts.slice(3).join('');
    return this.isValidUint16(parts[0]) &&
      this.isValidUint8(parts[1]) &&
      this.isValidUint8(parts[2]) &&
      /^[0-9a-fA-F]+$/.test(digest);
  }

  // TLSA/SMIMEA: usage(uint8) selector(uint8) matching-type(uint8) cert(hex).
  private isValidTLSA(value: string): boolean {
    if (typeof value !== 'string') return false;
    const parts = value.trim().split(/\s+/);
    if (parts.length < 4) return false;
    const cert = parts.slice(3).join('');
    return this.isValidUint8(parts[0]) &&
      this.isValidUint8(parts[1]) &&
      this.isValidUint8(parts[2]) &&
      /^[0-9a-fA-F]+$/.test(cert);
  }

  /**
   * Validate MX record
   */
  private isValidMX(value: string): boolean {
    const parts = value.split(/\s+/);
    if (parts.length !== 2) return false;

    const target = parts[1];
    return (
      this.isValidUint16(parts[0]) &&
      // "." is the null-MX target (RFC 7505: "0 .").
      (target === '.' || this.isValidHostname(target))
    );
  }

  /**
   * Validate SRV record
   */
  private isValidSRV(value: string): boolean {
    const parts = value.split(/\s+/);
    if (parts.length !== 4) return false;

    return (
      this.isValidUint16(parts[0]) &&
      this.isValidUint16(parts[1]) &&
      this.isValidUint16(parts[2]) &&
      // "." is a valid SRV target meaning "service not available" (RFC 2782).
      (parts[3] === '.' || this.isValidHostname(parts[3]))
    );
  }

  /**
   * Validate CAA record
   */
  private validateCAA(value: string, errors: string[], warnings: string[]): void {
    if (typeof value !== 'string') {
      errors.push('Invalid CAA record format (should be: flags tag value)');
      return;
    }
    const parts = value.split(/\s+/);
    if (parts.length < 3) {
      errors.push('Invalid CAA record format (should be: flags tag value)');
      return;
    }

    const [flagsStr, tag] = parts;
    if (!/^\d+$/.test(flagsStr) || parseInt(flagsStr, 10) > 255) {
      errors.push('CAA flags must be an integer between 0 and 255');
    }

    // RFC 8659 §4.1: a property tag is 1*(ALPHA / DIGIT). Tags are extensible,
    // so an unrecognised but well-formed tag is a warning, not an error — the
    // IANA registry includes contactemail/contactphone/issuevmc beyond the
    // common three.
    if (!/^[a-z0-9]+$/i.test(tag)) {
      errors.push(`Invalid CAA tag: "${tag}"`);
    } else if (!ValidationService.CAA_KNOWN_TAGS.has(tag.toLowerCase())) {
      warnings.push(`Unrecognised CAA tag "${tag}" (not an IANA-registered property)`);
    }

    if (parts.slice(2).join(' ').trim() === '') {
      errors.push('CAA record is missing its value');
    }
  }

}

export const validationService = new ValidationService();

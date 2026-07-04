// src/services/dnsValidationService.ts
import { DNSRecord } from '../types/dns';
import { detectTxtSubtype } from './validators/detectTxtSubtype';
import { validateSpf } from './validators/spfValidator';
import { validateDkim } from './validators/dkimValidator';
import { validateDmarc } from './validators/dmarcValidator';

interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

class DNSValidationService {
  static validateRecord(record: any, zone: string): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Validate name
    if (!record.name) {
      errors.push('Record name is required');
    } else if (record.name !== '@' && !this.isValidHostname(record.name, record.type)) {
      errors.push('Invalid record name format');
    }

    // Validate TTL. TTL 0 is valid (RFC 2181 §8: "no caching"), so only a
    // missing value is an error — not a falsy 0.
    if (record.ttl === undefined || record.ttl === null || record.ttl === '') {
      errors.push('TTL is required');
    } else if (record.ttl < 0 || record.ttl > 2147483647) {
      errors.push('TTL must be between 0 and 2147483647');
    }

    // Validate value based on record type
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
        if (!this.isValidHostname(record.value)) {
          errors.push('Invalid CNAME target format');
        }
        break;
      case 'NS':
        if (!this.isValidHostname(record.value)) {
          errors.push('Invalid NS target format');
        }
        break;
      case 'DNAME':
        if (!this.isValidHostname(record.value)) {
          errors.push('Invalid DNAME target format');
        }
        break;
      case 'MX':
        if (!this.isValidMX(record.value)) {
          errors.push('Invalid MX record format (should be: priority hostname)');
        }
        break;
      case 'TXT':
        if (typeof record.value !== 'string' && !Array.isArray(record.value)) {
          errors.push('Invalid TXT record format');
        } else if (typeof record.value === 'string') {
          const subtype = detectTxtSubtype(record.value, record.name);
          if (subtype) {
            const validator = subtype === 'spf' ? validateSpf
              : subtype === 'dkim' ? validateDkim
              : validateDmarc;
            const result = validator(record.value);
            errors.push(...result.errors);
            warnings.push(...result.warnings);
          }
        }
        break;
      case 'SRV':
        if (!this.isValidSRV(record.value)) {
          errors.push('Invalid SRV record format (should be: priority weight port target)');
        }
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
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  static parseSOAValue(value: string): any {
    if (typeof value === 'object') return value;

    const parts = value.split(/\s+/);
    return {
      mname: parts[0] || '',
      rname: parts[1] || '',
      serial: parseInt(parts[2], 10) || 0,
      refresh: parseInt(parts[3], 10) || 3600,
      retry: parseInt(parts[4], 10) || 1800,
      expire: parseInt(parts[5], 10) || 604800,
      minimum: parseInt(parts[6], 10) || 86400
    };
  }

  private static isValidHostname(hostname: string, _recordType?: string): boolean {
    // RFC 1035 §2.3.4: a domain name is at most 255 octets.
    if (hostname.length > 255) return false;

    // Bare wildcard (a wildcard record directly at the zone apex, RFC 4592).
    if (hostname === '*') return true;

    // Wildcards are only valid as the leftmost label; validate the remainder.
    if (hostname.startsWith('*.')) {
      return this.isValidHostname(hostname.substring(2), _recordType);
    }

    // Underscore labels are legal in the DNS (RFC 2181 §11) and required for
    // service names (_dmarc, _acme-challenge, selector._domainkey), so allow
    // underscores in every label rather than only for TXT/SRV.
    const regex = /^[a-zA-Z0-9_]([a-zA-Z0-9_-]{0,61}[a-zA-Z0-9_])?(\.[a-zA-Z0-9_]([a-zA-Z0-9_-]{0,61}[a-zA-Z0-9_])?)*\.?$/;
    return regex.test(hostname);
  }

  private static isValidIPv4(ip: string): boolean {
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

  static isValidIPv6(ip: string): boolean {
    // Handles full, compressed (::), and embedded-IPv4 forms in any position
    // (::ffff:192.0.2.1, 64:ff9b::1.2.3.4). An embedded dotted-quad may only be
    // the final element and counts as two 16-bit groups (RFC 4291 §2.2).
    ip = ip.trim();
    if (ip.length === 0) return false;

    const parts = ip.split('::');
    if (parts.length > 2) return false; // at most one "::"
    const compressed = parts.length === 2;

    // Count the 16-bit groups a segment contributes, or null if malformed.
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
      // "::" must stand in for at least one group.
      return left + right < 8;
    }

    return groupCount(ip) === 8;
  }

  private static isValidUint16(token: string): boolean {
    // Digits only (parseInt would accept "10x"/"1.5"), 0..65535.
    if (!/^\d+$/.test(token)) return false;
    const num = parseInt(token, 10);
    return num >= 0 && num <= 65535;
  }

  private static isValidUint8(token: string): boolean {
    if (!/^\d+$/.test(token)) return false;
    const num = parseInt(token, 10);
    return num >= 0 && num <= 255;
  }

  // DS/CDS: key-tag(uint16) algorithm(uint8) digest-type(uint8) digest(hex).
  private static isValidDS(value: string): boolean {
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
  private static isValidTLSA(value: string): boolean {
    if (typeof value !== 'string') return false;
    const parts = value.trim().split(/\s+/);
    if (parts.length < 4) return false;
    const cert = parts.slice(3).join('');
    return this.isValidUint8(parts[0]) &&
      this.isValidUint8(parts[1]) &&
      this.isValidUint8(parts[2]) &&
      /^[0-9a-fA-F]+$/.test(cert);
  }

  private static isValidMX(value: string): boolean {
    const parts = value.split(/\s+/);
    if (parts.length !== 2) return false;

    const target = parts[1];
    // "." is the null-MX target (RFC 7505: "0 .").
    const hostnameOk = target === '.' || target === '@' || this.isValidHostname(target);
    return this.isValidUint16(parts[0]) && hostnameOk;
  }

  private static isValidSRV(value: string): boolean {
    const parts = value.split(/\s+/);
    if (parts.length !== 4) return false;

    // "." is a valid SRV target meaning "service not available" (RFC 2782).
    const targetOk = parts[3] === '.' || this.isValidHostname(parts[3]);
    return this.isValidUint16(parts[0]) &&
           this.isValidUint16(parts[1]) &&
           this.isValidUint16(parts[2]) &&
           targetOk;
  }
}

export { DNSValidationService }; 
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

      case 'DNSKEY':
      case 'CDNSKEY':
        this.validateDNSKEY(record.type, record.value, errors, warnings);
        break;

      case 'NAPTR':
        this.validateNAPTR(record.value, errors, warnings);
        break;

      case 'SVCB':
      case 'HTTPS':
        this.validateSVCB(record.type, record.value, errors, warnings);
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

  // IANA-registered SVCB/HTTPS SvcParamKeys (RFC 9460 §14.3 + dohpath from
  // RFC 9461). Unregistered keyNNNNN forms are always allowed; other unknown
  // keys are a warning, not an error — the registry is extensible.
  private static readonly SVCB_KNOWN_PARAMS = new Set([
    'mandatory', 'alpn', 'no-default-alpn', 'port', 'ipv4hint', 'ech', 'ipv6hint', 'dohpath',
  ]);

  // DNSKEY/CDNSKEY (RFC 4034 §2): flags(uint16) protocol(must be 3)
  // algorithm(uint8) public-key(base64, whitespace tolerated between groups).
  private validateDNSKEY(type: string, value: string, errors: string[], warnings: string[]): void {
    const usage = `Invalid ${type} record format (should be: flags protocol algorithm public-key-base64)`;
    if (typeof value !== 'string') {
      errors.push(usage);
      return;
    }
    const parts = value.trim().split(/\s+/);
    if (parts.length < 4) {
      errors.push(usage);
      return;
    }
    const [flags, protocol, algorithm] = parts;
    if (!this.isValidUint16(flags)) {
      errors.push(`${type} flags must be an integer between 0 and 65535`);
    } else if (![0, 256, 257].includes(parseInt(flags, 10))) {
      // Only bit 7 (Zone Key) and bit 15 (SEP) are assigned (RFC 4034 §2.1.1).
      warnings.push(`${type} flags is normally 0, 256 (ZSK) or 257 (KSK); got ${flags}`);
    }
    if (!/^\d+$/.test(protocol) || parseInt(protocol, 10) !== 3) {
      errors.push(`${type} protocol must be 3 (RFC 4034 §2.1.2)`);
    }
    if (!this.isValidUint8(algorithm)) {
      errors.push(`${type} algorithm must be an integer between 0 and 255`);
    }
    // Base64 may be split into whitespace-separated groups in presentation
    // format; validate the concatenated charset (padding only at the end).
    const publicKey = parts.slice(3).join('');
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(publicKey)) {
      errors.push(`${type} public key must be non-empty base64`);
    }
  }

  // NAPTR (RFC 3403 §4.1): order(uint16) preference(uint16) "flags" "service"
  // "regexp" replacement. The three middle fields must be quoted; replacement
  // is a domain name or ".". Regexp and replacement are mutually exclusive,
  // but that is a warning only — servers accept records carrying both.
  private validateNAPTR(value: string, errors: string[], warnings: string[]): void {
    const usage = 'Invalid NAPTR record format (should be: order preference "flags" "service" "regexp" replacement)';
    if (typeof value !== 'string') {
      errors.push(usage);
      return;
    }
    const match = value.trim().match(/^(\S+)\s+(\S+)\s+"([^"]*)"\s+"([^"]*)"\s+"([^"]*)"\s+(\S+)$/);
    if (!match) {
      errors.push(usage);
      return;
    }
    const [, order, preference, flags, , regexp, replacement] = match;
    if (!this.isValidUint16(order)) {
      errors.push('NAPTR order must be an integer between 0 and 65535');
    }
    if (!this.isValidUint16(preference)) {
      errors.push('NAPTR preference must be an integer between 0 and 65535');
    }
    if (!/^[A-Za-z0-9]*$/.test(flags)) {
      errors.push('NAPTR flags must contain only letters and digits (RFC 3403 §4.1)');
    }
    if (replacement !== '.' && !this.isValidHostname(replacement)) {
      errors.push('NAPTR replacement must be a domain name or "."');
    }
    if (regexp !== '' && replacement !== '.') {
      warnings.push('NAPTR regexp and replacement are mutually exclusive (RFC 3403 §4.1): use "." as the replacement when a regexp is set');
    }
  }

  // SVCB/HTTPS (RFC 9460 §2.1): priority(uint16) target(domain name or ".")
  // [SvcParams]. Params are key=value or bare-key tokens; known keys get
  // value-shape checks, keyNNNNN forms are allowed, other unknown keys warn.
  private validateSVCB(type: string, value: string, errors: string[], warnings: string[]): void {
    const usage = `Invalid ${type} record format (should be: priority target [key=value ...])`;
    if (typeof value !== 'string') {
      errors.push(usage);
      return;
    }
    const parts = value.trim().split(/\s+/);
    if (parts.length < 2) {
      errors.push(usage);
      return;
    }
    const [priority, target] = parts;
    if (!this.isValidUint16(priority)) {
      errors.push(`${type} priority must be an integer between 0 and 65535`);
    }
    if (target !== '.' && !this.isValidHostname(target)) {
      errors.push(`${type} target must be a domain name or "."`);
    }
    const params = parts.slice(2);
    if (params.length > 0 && parseInt(priority, 10) === 0) {
      warnings.push(`${type} priority 0 is AliasMode: SvcParams are ignored (RFC 9460 §2.4.2)`);
    }
    const seen = new Set<string>();
    for (const token of params) {
      // SvcParamKeys are lower-case alphanumerics and hyphens (RFC 9460 §2.1).
      const m = token.match(/^([a-z0-9-]+)(?:=(.*))?$/);
      if (!m) {
        errors.push(`${type} SvcParam "${token}" is malformed (expected key or key=value)`);
        continue;
      }
      const key = m[1];
      const hasValue = m[2] !== undefined;
      let val = m[2] ?? '';
      // Presentation format allows quoting the value (alpn="h2,h3").
      if (val.length >= 2 && val.startsWith('"') && val.endsWith('"')) {
        val = val.slice(1, -1);
      }
      if (seen.has(key)) {
        errors.push(`${type} SvcParam "${key}" appears more than once (RFC 9460 §2.2)`);
      }
      seen.add(key);
      if (/^key\d+$/.test(key)) {
        if (parseInt(key.slice(3), 10) > 65535) {
          errors.push(`${type} SvcParam key number must be 0-65535: "${key}"`);
        }
        continue;
      }
      if (!ValidationService.SVCB_KNOWN_PARAMS.has(key)) {
        warnings.push(`Unrecognised ${type} SvcParam "${key}" (not an IANA-registered key)`);
        continue;
      }
      switch (key) {
        case 'no-default-alpn':
          if (hasValue) {
            errors.push(`${type} no-default-alpn must not have a value (RFC 9460 §7.1.1)`);
          }
          break;
        case 'port':
          if (!this.isValidUint16(val)) {
            errors.push(`${type} port must be an integer between 0 and 65535`);
          }
          break;
        case 'ipv4hint':
          if (val === '' || !val.split(',').every(ip => this.isValidIPv4(ip))) {
            errors.push(`${type} ipv4hint must be a comma-separated list of IPv4 addresses`);
          }
          break;
        case 'ipv6hint':
          if (val === '' || !val.split(',').every(ip => this.isValidIPv6(ip))) {
            errors.push(`${type} ipv6hint must be a comma-separated list of IPv6 addresses`);
          }
          break;
        default:
          // alpn, mandatory, ech, dohpath all require a non-empty value.
          if (!hasValue || val === '') {
            errors.push(`${type} ${key} requires a value`);
          }
          break;
      }
    }
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

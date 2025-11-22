// backend/src/services/validationService.ts
// Server-side validation for DNS records

import { DNSRecord } from '../types/dns';

interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

class ValidationService {
  /**
   * Validate a DNS record
   */
  validateRecord(record: any, zone: string): ValidationResult {
    const errors: string[] = [];

    // Validate required fields
    if (!record) {
      errors.push('Record data is required');
      return { isValid: false, errors };
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

    if (!record.ttl) {
      errors.push('TTL is required');
    } else if (record.ttl < 0 || record.ttl > 2147483647) {
      errors.push('TTL must be between 0 and 2147483647');
    }

    // Type-specific validation
    if (record.type) {
      this.validateRecordType(record, errors);
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Validate record based on type
   */
  private validateRecordType(record: any, errors: string[]): void {
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
        if (!this.isValidHostname(record.value)) {
          errors.push(`Invalid ${record.type} target format`);
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
        }
        break;

      case 'SRV':
        if (!this.isValidSRV(record.value)) {
          errors.push('Invalid SRV record format (should be: priority weight port target)');
        }
        break;

      case 'CAA':
        if (!this.isValidCAA(record.value)) {
          errors.push('Invalid CAA record format (should be: flags tag value)');
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
    const regex = /^(\d{1,3}\.){3}\d{1,3}$/;
    if (!regex.test(ip)) return false;

    const parts = ip.split('.');
    return parts.every(part => {
      const num = parseInt(part, 10);
      return num >= 0 && num <= 255;
    });
  }

  /**
   * Validate IPv6 address (comprehensive)
   */
  private isValidIPv6(ip: string): boolean {
    ip = ip.trim();

    // IPv4-mapped IPv6
    const ipv4MappedRegex = /^::ffff:(\d{1,3}\.){3}\d{1,3}$/i;
    if (ipv4MappedRegex.test(ip)) {
      const ipv4Part = ip.split(':').pop();
      return ipv4Part ? this.isValidIPv4(ipv4Part) : false;
    }

    const parts = ip.split('::');
    if (parts.length > 2) return false;

    const validatePart = (part: string): boolean => {
      if (!part) return true;
      const segments = part.split(':');
      return segments.every(seg => {
        if (!seg) return false;
        return /^[0-9a-f]{1,4}$/i.test(seg);
      });
    };

    if (parts.length === 2) {
      const [left, right] = parts;
      if (!left && !right) return ip === '::';
      if (!validatePart(left) || !validatePart(right)) return false;

      const leftSegments = left ? left.split(':').length : 0;
      const rightSegments = right ? right.split(':').length : 0;
      return leftSegments + rightSegments < 8;
    } else {
      const segments = ip.split(':');
      if (segments.length !== 8) return false;
      return segments.every(seg => /^[0-9a-f]{1,4}$/i.test(seg));
    }
  }

  /**
   * Validate hostname
   */
  private isValidHostname(hostname: string): boolean {
    if (!hostname || hostname === '@') return true;

    // Allow wildcards
    if (hostname.startsWith('*.')) {
      hostname = hostname.substring(2);
    }

    // Allow underscores for special records
    const regex = /^[a-zA-Z0-9_]([a-zA-Z0-9_-]{0,61}[a-zA-Z0-9_])?(\.[a-zA-Z0-9_]([a-zA-Z0-9_-]{0,61}[a-zA-Z0-9_])?)*\.?$/;
    return regex.test(hostname);
  }

  /**
   * Validate MX record
   */
  private isValidMX(value: string): boolean {
    const parts = value.split(/\s+/);
    if (parts.length !== 2) return false;

    const priority = parseInt(parts[0], 10);
    const target = parts[1];

    return (
      !isNaN(priority) &&
      priority >= 0 &&
      priority <= 65535 &&
      this.isValidHostname(target)
    );
  }

  /**
   * Validate SRV record
   */
  private isValidSRV(value: string): boolean {
    const parts = value.split(/\s+/);
    if (parts.length !== 4) return false;

    const [priority, weight, port] = parts.map(p => parseInt(p, 10));
    return (
      !isNaN(priority) && priority >= 0 && priority <= 65535 &&
      !isNaN(weight) && weight >= 0 && weight <= 65535 &&
      !isNaN(port) && port >= 0 && port <= 65535 &&
      this.isValidHostname(parts[3])
    );
  }

  /**
   * Validate CAA record
   */
  private isValidCAA(value: string): boolean {
    const parts = value.split(/\s+/);
    if (parts.length < 3) return false;

    const flags = parseInt(parts[0], 10);
    const tag = parts[1];

    return (
      !isNaN(flags) &&
      flags >= 0 &&
      flags <= 255 &&
      ['issue', 'issuewild', 'iodef'].includes(tag)
    );
  }

  /**
   * Sanitize record name to prevent injection
   */
  sanitizeRecordName(name: string): string {
    // Remove any characters that could be dangerous in DNS
    return name.replace(/[^\w\d.-_@*]/g, '');
  }

  /**
   * Sanitize record value
   */
  sanitizeRecordValue(value: string, type: string): string {
    // For TXT records, allow more characters but escape quotes
    if (type === 'TXT') {
      return value; // Quotes are handled separately
    }

    // For other types, be more restrictive
    return value.trim();
  }
}

export const validationService = new ValidationService();

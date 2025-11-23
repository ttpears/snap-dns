import { DNSRecord } from '../types/dns';

interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

class DNSValidationService {
  static validateRecord(record: any, zone: string): ValidationResult {
    const errors: string[] = [];

    // Validate name
    if (!record.name) {
      errors.push('Record name is required');
    } else if (record.name !== '@' && !this.isValidHostname(record.name, record.type)) {
      errors.push('Invalid record name format');
    }

    // Validate TTL
    if (!record.ttl) {
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
      case 'MX':
        if (!this.isValidMX(record.value)) {
          errors.push('Invalid MX record format (should be: priority hostname)');
        }
        break;
      case 'TXT':
        // TXT records are fairly permissive
        if (typeof record.value !== 'string' && !Array.isArray(record.value)) {
          errors.push('Invalid TXT record format');
        }
        break;
      case 'SRV':
        if (!this.isValidSRV(record.value)) {
          errors.push('Invalid SRV record format (should be: priority weight port target)');
        }
        break;
    }

    return {
      isValid: errors.length === 0,
      errors
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

  private static isValidHostname(hostname: string, recordType?: string): boolean {
    // Handle wildcard records
    if (hostname.startsWith('*.')) {
      // Wildcards are only valid at the start of a name
      // Remove the wildcard and validate the rest of the hostname
      return this.isValidHostname(hostname.substring(2), recordType);
    }

    // Special case for TXT records which allow underscores
    if (recordType === 'TXT') {
      // Modified regex to allow underscores anywhere in TXT record names
      const regex = /^[a-zA-Z0-9_]([a-zA-Z0-9_-]{0,61}[a-zA-Z0-9_])?(\.[a-zA-Z0-9_]([a-zA-Z0-9_-]{0,61}[a-zA-Z0-9_])?)*\.?$/;
      return regex.test(hostname);
    }

    // Special case for SRV records which allow underscores at start
    if (recordType === 'SRV') {
      const regex = /^[a-zA-Z0-9_]([a-zA-Z0-9_-]{0,61}[a-zA-Z0-9_])?(\.[a-zA-Z0-9_]([a-zA-Z0-9_-]{0,61}[a-zA-Z0-9_])?)*\.?$/;
      return regex.test(hostname);
    }

    // Regular hostname validation for other record types
    // Allow wildcards at the start of labels
    const regex = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\.?$/;
    return regex.test(hostname);
  }

  private static isValidIPv4(ip: string): boolean {
    const regex = /^(\d{1,3}\.){3}\d{1,3}$/;
    if (!regex.test(ip)) return false;
    
    const parts = ip.split('.');
    return parts.every(part => {
      const num = parseInt(part, 10);
      return num >= 0 && num <= 255;
    });
  }

  private static isValidIPv6(ip: string): boolean {
    // Comprehensive IPv6 validation including:
    // - Full format: 2001:0db8:85a3:0000:0000:8a2e:0370:7334
    // - Compressed format: 2001:db8:85a3::8a2e:370:7334
    // - IPv4-mapped: ::ffff:192.0.2.1
    // - Loopback: ::1
    // - All zeros: ::

    // Remove leading/trailing whitespace
    ip = ip.trim();

    // Check for IPv4-mapped IPv6 (::ffff:192.0.2.1)
    const ipv4MappedRegex = /^::ffff:(\d{1,3}\.){3}\d{1,3}$/i;
    if (ipv4MappedRegex.test(ip)) {
      const ipv4Part = ip.split(':').pop();
      return ipv4Part ? this.isValidIPv4(ipv4Part) : false;
    }

    // Split on ::
    const parts = ip.split('::');

    // Can only have one :: compression
    if (parts.length > 2) return false;

    // Validate each part
    const validatePart = (part: string): boolean => {
      if (!part) return true; // Empty is ok for ::
      const segments = part.split(':');
      return segments.every(seg => {
        if (!seg) return false; // Empty segment not allowed within a part
        return /^[0-9a-f]{1,4}$/i.test(seg);
      });
    };

    if (parts.length === 2) {
      // Compressed format (has ::)
      const [left, right] = parts;

      // Both can't be empty unless it's :: (all zeros)
      if (!left && !right) {
        return ip === '::';
      }

      // Validate both parts
      if (!validatePart(left) || !validatePart(right)) return false;

      // Check total segment count doesn't exceed 8
      const leftSegments = left ? left.split(':').length : 0;
      const rightSegments = right ? right.split(':').length : 0;
      return leftSegments + rightSegments < 8;

    } else {
      // Full format (no ::)
      const segments = ip.split(':');

      // Must have exactly 8 segments in full format
      if (segments.length !== 8) return false;

      // Validate all segments
      return segments.every(seg => /^[0-9a-f]{1,4}$/i.test(seg));
    }
  }

  private static isValidMX(value: string): boolean {
    const parts = value.split(/\s+/);
    if (parts.length !== 2) return false;
    
    const priority = parseInt(parts[0], 10);
    const target = parts[1];
    const hostnameOk = target === '@' || this.isValidHostname(target);
    return !isNaN(priority) && priority >= 0 && priority <= 65535 && hostnameOk;
  }

  private static isValidSRV(value: string): boolean {
    const parts = value.split(/\s+/);
    if (parts.length !== 4) return false;

    const [priority, weight, port] = parts.map(p => parseInt(p, 10));
    return !isNaN(priority) && !isNaN(weight) && !isNaN(port) &&
           priority >= 0 && priority <= 65535 &&
           weight >= 0 && weight <= 65535 &&
           port >= 0 && port <= 65535 &&
           this.isValidHostname(parts[3]);
  }
}

export { DNSValidationService }; 
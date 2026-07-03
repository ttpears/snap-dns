// src/services/dnsRecordFormatter.ts
import { DNSRecord } from '../types/dns';

// We can't directly use dns-packet in the frontend due to Node.js dependencies,
// but we can follow its formatting rules
export class DNSRecordFormatter {
  static formatRecord(record: DNSRecord, zone: string): DNSRecord {
    const formatted = {
      ...record,
      value: this.formatValue(record.type, record.value)
    };

    // Handle record name formatting
    if (formatted.name === '@') {
      // For apex records, use the zone name
      formatted.name = zone;
    } else if (record.type === 'PTR' && zone.endsWith('.in-addr.arpa')) {
      // For PTR records in IPv4 reverse zones, produce the fully-qualified
      // reverse name (e.g. 192.0.2.5 -> 5.2.0.192.in-addr.arpa) rather than a
      // bare reversed dotted-quad that would land outside the zone.
      formatted.name = DNSRecordFormatter.toReversePtrName(formatted.name, zone);
    } else {
      // For non-apex records, handle wildcards and append zone if needed
      const name = formatted.name;
      if (name.startsWith('*.')) {
        // Preserve wildcard and append zone if not already present
        const baseName = name.substring(2);
        formatted.name = baseName ? `*.${baseName}.${zone}` : `*.${zone}`;
      } else if (!formatted.name.endsWith(zone)) {
        // For non-wildcard records, append zone if not already present
        formatted.name = `${formatted.name}.${zone}`;
      }
    }

    // Ensure name ends with dot
    if (!formatted.name.endsWith('.')) {
      formatted.name = `${formatted.name}.`;
    }

    // Expand apex shorthand in MX target if used
    if (formatted.type === 'MX' && typeof formatted.value === 'string') {
      const match = formatted.value.match(/^(\d+)\s+(@)\.?$/);
      if (match) {
        const priority = match[1];
        const zoneFqdn = zone.endsWith('.') ? zone : `${zone}.`;
        formatted.value = `${priority} ${zoneFqdn}`;
      }
    }

    return formatted;
  }

  private static formatValue(type: string, value: any): string | string[] {
    switch (type) {
      case 'A':
        return this.formatARecord(value);
      case 'AAAA':
        return this.formatAAAARecord(value);
      case 'CNAME':
      case 'NS':
        return this.formatNameRecord(value);
      case 'MX':
        return this.formatMXRecord(value);
      case 'TXT':
        return this.formatTXTRecord(value);
      case 'SRV':
        return this.formatSRVRecord(value);
      case 'CAA':
        return this.formatCAARecord(value);
      case 'SSHFP':
        return this.formatSSHFPRecord(value);
      default:
        return String(value);
    }
  }

  private static formatARecord(value: string): string {
    // Validate IPv4 format
    const parts = value.split('.');
    if (parts.length !== 4) {
      throw new Error('Invalid IPv4 address format');
    }
    return parts.map(part => {
      const num = parseInt(part, 10);
      if (isNaN(num) || num < 0 || num > 255) {
        throw new Error('Invalid IPv4 address value');
      }
      return num;
    }).join('.');
  }

  private static formatAAAARecord(value: string): string {
    // Basic IPv6 validation and normalization
    const parts = value.split(':');
    if (parts.length !== 8) {
      throw new Error('Invalid IPv6 address format');
    }
    return parts.map(part => {
      if (!/^[0-9A-Fa-f]{1,4}$/.test(part)) {
        throw new Error('Invalid IPv6 address value');
      }
      return part.toUpperCase();
    }).join(':');
  }

  private static formatNameRecord(value: string): string {
    // Ensure FQDN ends with dot
    return value.endsWith('.') ? value : `${value}.`;
  }

  private static formatMXRecord(value: string): string {
    const [priority, target] = value.split(/\s+/);
    const num = parseInt(priority, 10);
    if (isNaN(num) || num < 0 || num > 65535) {
      throw new Error('Invalid MX priority value');
    }
    const formattedTarget = target === '@' ? '@' : this.formatNameRecord(target);
    return `${num} ${formattedTarget}`;
  }

  private static formatTXTRecord(value: string | string[]): string | string[] {
    // Preserve multi-segment TXT values (chunked >255-byte strings) as an array
    // so each segment is quoted independently downstream ("seg1" "seg2").
    // Flattening here would collapse them into one oversized, mis-quoted string.
    return value;
  }

  private static formatSRVRecord(value: string): string {
    const [priority, weight, port, target] = value.split(/\s+/);
    const nums = [priority, weight, port].map(n => {
      const num = parseInt(n, 10);
      if (isNaN(num) || num < 0 || num > 65535) {
        throw new Error('Invalid SRV numeric value');
      }
      return num;
    });
    return `${nums[0]} ${nums[1]} ${nums[2]} ${this.formatNameRecord(target)}`;
  }

  private static formatCAARecord(value: string): string {
    // flags and tag are single tokens; everything after the tag is the value,
    // which may contain spaces (e.g. issue with CA parameters).
    const match = value.trim().match(/^(\S+)\s+(\S+)\s+([\s\S]+)$/);
    if (!match) {
      throw new Error('Invalid CAA record format (expected: flags tag value)');
    }
    const [, flags, tag, rawValue] = match;
    const num = parseInt(flags, 10);
    if (isNaN(num) || num < 0 || num > 255) {
      throw new Error('Invalid CAA flags value');
    }
    if (!['issue', 'issuewild', 'iodef'].includes(tag)) {
      throw new Error('Invalid CAA tag');
    }
    // Accept the value with or without surrounding quotes, then quote exactly
    // once, escaping backslash first and then any embedded double-quote.
    const unquoted = rawValue.replace(/^"([\s\S]*)"$/, '$1');
    const escaped = unquoted.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    return `${num} ${tag} "${escaped}"`;
  }

  /**
   * Build the fully-qualified reverse-DNS owner name for a PTR record in an
   * .in-addr.arpa zone. Accepts a full IPv4 address (reversed under
   * in-addr.arpa), an already-qualified reverse name (returned as-is), or a
   * host-relative label (qualified against the reverse zone). Returned without a
   * trailing dot; the caller appends it.
   */
  static toReversePtrName(input: string, zone: string): string {
    const name = input.replace(/\.$/, '');
    if (/\.(in-addr|ip6)\.arpa$/i.test(name)) {
      return name;
    }
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(name)) {
      return `${name.split('.').reverse().join('.')}.in-addr.arpa`;
    }
    // Partial/host-relative input: qualify against the reverse zone.
    return `${name}.${zone.replace(/\.$/, '')}`;
  }

  private static formatSSHFPRecord(value: string): string {
    const [algorithm, fptype, fingerprint] = value.split(/\s+/);
    const alg = parseInt(algorithm, 10);
    const fp = parseInt(fptype, 10);
    if (![1, 2, 3, 4].includes(alg)) {
      throw new Error('Invalid SSHFP algorithm value');
    }
    if (![1, 2].includes(fp)) {
      throw new Error('Invalid SSHFP fingerprint type');
    }
    if (!/^[0-9A-Fa-f]+$/.test(fingerprint)) {
      throw new Error('Invalid SSHFP fingerprint value');
    }
    return `${alg} ${fp} ${fingerprint.toLowerCase()}`;
  }
} 
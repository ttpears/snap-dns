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
      // For PTR records in IPv4 reverse zones, ensure octets are in reverse order
      const octets = formatted.name.split('.');
      if (octets.length <= 4) {  // Handle partial IP address
        // Remove any existing .in-addr.arpa suffix
        const cleanName = formatted.name.replace(/\.in-addr\.arpa\.?$/, '');
        // Split IP, reverse octets, and append zone
        formatted.name = cleanName.split('.').reverse().join('.');
      }
    } else if (!formatted.name.endsWith(zone)) {
      // For non-apex records, append the zone if not already present
      formatted.name = `${formatted.name}.${zone}`;
    }

    // Ensure name ends with dot
    if (!formatted.name.endsWith('.')) {
      formatted.name = `${formatted.name}.`;
    }

    return formatted;
  }

  private static formatValue(type: string, value: any): string {
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
    return `${num} ${this.formatNameRecord(target)}`;
  }

  private static formatTXTRecord(value: string | string[]): string {
    if (Array.isArray(value)) {
      return value.join(' ');
    }
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
    const [flags, tag, value_str] = value.split(/\s+/);
    const num = parseInt(flags, 10);
    if (isNaN(num) || num < 0 || num > 255) {
      throw new Error('Invalid CAA flags value');
    }
    if (!['issue', 'issuewild', 'iodef'].includes(tag)) {
      throw new Error('Invalid CAA tag');
    }
    return `${num} ${tag} "${value_str.replace(/"/g, '\\"')}"`;
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
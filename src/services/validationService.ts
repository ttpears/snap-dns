import { DNSRecord, RecordType, PendingChange, ValidationResult } from '../types/dns';

export class DNSValidationService {
  validateRecord(record: DNSRecord, zone: string): ValidationResult {
    const errors: string[] = [];
    
    // Basic name validation
    if (!this.isValidHostname(record.name, zone)) {
      errors.push(`Invalid hostname: ${record.name}`);
    }

    // Type-specific validation
    switch (record.type) {
      case RecordType.A:
        if (!this.isValidIPv4(record.value)) {
          errors.push(`Invalid IPv4 address: ${record.value}`);
        }
        break;
      
      case RecordType.AAAA:
        if (!this.isValidIPv6(record.value)) {
          errors.push(`Invalid IPv6 address: ${record.value}`);
        }
        break;

      case RecordType.MX:
        if (!this.isValidMXRecord(record.value)) {
          errors.push(`Invalid MX record format: ${record.value}`);
        }
        break;

      case RecordType.CNAME:
        if (!this.isValidHostname(record.value, zone)) {
          errors.push(`Invalid CNAME target: ${record.value}`);
        }
        break;

      case RecordType.TXT:
        if (!this.isValidTXT(record.value)) {
          errors.push(`Invalid TXT record format: ${record.value}`);
        }
        break;

      case RecordType.SRV:
        if (!this.isValidSRV(record.value)) {
          errors.push(`Invalid SRV record format: ${record.value}`);
        }
        break;

      case RecordType.SOA:
        if (!this.isValidSOA(record.value)) {
          errors.push(`Invalid SOA record format: ${record.value}`);
        }
        break;

      case RecordType.CAA:
        if (!this.isValidCAA(record.value)) {
          errors.push(`Invalid CAA record format: ${record.value}`);
        }
        break;

      case RecordType.SSHFP:
        if (!this.isValidSSHFP(record.value)) {
          errors.push(`Invalid SSHFP record format: ${record.value}`);
        }
        break;

      case RecordType.PTR:
        if (!this.isValidHostname(record.value, '')) {
          errors.push(`Invalid PTR target: ${record.value}`);
        }
        break;

      case RecordType.NS:
        if (!this.isValidHostname(record.value, '')) {
          errors.push(`Invalid NS target: ${record.value}`);
        }
        break;
    }

    // TTL validation
    if (!Number.isInteger(record.ttl) || record.ttl < 0) {
      errors.push(`Invalid TTL value: ${record.ttl}`);
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  private isValidHostname(name: string, zone: string): boolean {
    // Handle root zone case
    if (name === '@' || name === '') {
      return true;
    }

    // Handle absolute names (ending with dot)
    if (name.endsWith('.')) {
      name = name.slice(0, -1);
    }

    // Basic hostname validation
    const regex = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
    return regex.test(name) && name.length <= 253;
  }

  private isValidIPv4(ip: string): boolean {
    const regex = /^(\d{1,3}\.){3}\d{1,3}$/;
    if (!regex.test(ip)) return false;
    return ip.split('.').every(num => parseInt(num) >= 0 && parseInt(num) <= 255);
  }

  private isValidIPv6(ip: string): boolean {
    const regex = /^(?:(?:[a-fA-F\d]{1,4}:){7}[a-fA-F\d]{1,4}|(?:[a-fA-F\d]{1,4}:){1,7}:|(?:[a-fA-F\d]{1,4}:){1,6}:[a-fA-F\d]{1,4}|(?:[a-fA-F\d]{1,4}:){1,5}(?::[a-fA-F\d]{1,4}){1,2}|(?:[a-fA-F\d]{1,4}:){1,4}(?::[a-fA-F\d]{1,4}){1,3}|(?:[a-fA-F\d]{1,4}:){1,3}(?::[a-fA-F\d]{1,4}){1,4}|(?:[a-fA-F\d]{1,4}:){1,2}(?::[a-fA-F\d]{1,4}){1,5}|[a-fA-F\d]{1,4}:(?:(?::[a-fA-F\d]{1,4}){1,6})|:(?:(?::[a-fA-F\d]{1,4}){1,7}|:)|fe80:(?::[a-fA-F\d]{0,4}){0,4}%[0-9a-zA-Z]{1,})$/;
    return regex.test(ip);
  }

  private isValidMXRecord(value: string): boolean {
    const parts = value.split(/\s+/);
    if (parts.length !== 2) return false;
    
    const priority = parseInt(parts[0]);
    return !isNaN(priority) && priority >= 0 && priority <= 65535 && this.isValidHostname(parts[1], '');
  }

  validateZoneChanges(changes: PendingChange[], zone: string): ValidationResult {
    const errors: string[] = [];
    const recordsByName = new Map<string, DNSRecord[]>();

    // First pass: collect all records by name for conflict checking
    changes.forEach(change => {
      const record = change.type === 'ADD' ? 
        { name: change.name, type: change.recordType, value: change.value, ttl: change.ttl } :
        change.type === 'MODIFY' ? change.newRecord : null;

      if (record) {
        const existing = recordsByName.get(record.name) || [];
        recordsByName.set(record.name, [...existing, record]);
      }
    });

    // Second pass: validate each change
    changes.forEach(change => {
      switch (change.type) {
        case 'ADD':
          const newRecord = {
            name: change.name,
            type: change.recordType as RecordType,
            value: change.value,
            ttl: change.ttl
          };
          this.validateRecordConflicts(newRecord, recordsByName, errors);
          const addResult = this.validateRecord(newRecord, zone);
          errors.push(...addResult.errors);
          break;

        case 'MODIFY':
          if (change.newRecord) {
            this.validateRecordConflicts(change.newRecord, recordsByName, errors);
            const modifyResult = this.validateRecord(change.newRecord, zone);
            errors.push(...modifyResult.errors);
          }
          break;

        case 'DELETE':
          if (change.record && this.isRequiredRecord(change.record, zone)) {
            errors.push(`Cannot delete required ${change.record.type} record: ${change.record.name}`);
          }
          break;
      }
    });

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  private validateRecordConflicts(record: DNSRecord, recordsByName: Map<string, DNSRecord[]>, errors: string[]) {
    const existingRecords = recordsByName.get(record.name) || [];
    
    // CNAME conflict check
    if (record.type === RecordType.CNAME && existingRecords.length > 1) {
      errors.push(`CNAME record ${record.name} cannot coexist with other records`);
    }
    
    if (existingRecords.some(r => r.type === RecordType.CNAME && r !== record)) {
      errors.push(`Record ${record.name} conflicts with existing CNAME record`);
    }

    // Duplicate record check
    const duplicates = existingRecords.filter(r => 
      r.type === record.type && 
      r.value === record.value &&
      r !== record
    );
    
    if (duplicates.length > 0) {
      errors.push(`Duplicate ${record.type} record for ${record.name}`);
    }
  }

  private isRequiredRecord(record: DNSRecord, zone: string): boolean {
    // SOA and NS records at zone apex are required
    if (record.name === zone || record.name === '@') {
      return record.type === RecordType.SOA || record.type === RecordType.NS;
    }
    return false;
  }

  private isValidTXT(value: string): boolean {
    // TXT record can contain any printable ASCII character
    // Check for proper quoting and character validity
    const chunks = value.split('" "');
    return chunks.every(chunk => {
      const unquoted = chunk.replace(/^"|"$/g, '');
      return unquoted.length <= 255 && /^[\x20-\x7E]*$/.test(unquoted);
    });
  }

  private isValidSRV(value: string): boolean {
    const parts = value.split(/\s+/);
    if (parts.length !== 4) return false;

    const [priority, weight, port, target] = parts;
    return (
      !isNaN(parseInt(priority)) && parseInt(priority) >= 0 && parseInt(priority) <= 65535 &&
      !isNaN(parseInt(weight)) && parseInt(weight) >= 0 && parseInt(weight) <= 65535 &&
      !isNaN(parseInt(port)) && parseInt(port) >= 0 && parseInt(port) <= 65535 &&
      this.isValidHostname(target, '')
    );
  }

  private isValidSOA(value: any): boolean {
    if (typeof value !== 'object') return false;
    
    const requiredFields = ['mname', 'rname', 'serial', 'refresh', 'retry', 'expire', 'minimum'];
    if (!requiredFields.every(field => field in value)) return false;

    return (
      this.isValidHostname(value.mname, '') &&
      this.isValidHostname(value.rname.replace('@', '.'), '') &&
      !isNaN(parseInt(value.serial)) && parseInt(value.serial) >= 0 &&
      !isNaN(parseInt(value.refresh)) && parseInt(value.refresh) >= 0 &&
      !isNaN(parseInt(value.retry)) && parseInt(value.retry) >= 0 &&
      !isNaN(parseInt(value.expire)) && parseInt(value.expire) >= 0 &&
      !isNaN(parseInt(value.minimum)) && parseInt(value.minimum) >= 0
    );
  }

  private isValidCAA(caaString: string): boolean {
    const parts = caaString.split(/\s+/);
    if (parts.length !== 3) return false;

    const [flags, tag, domain] = parts;
    return (
      !isNaN(parseInt(flags)) && 
      parseInt(flags) >= 0 && 
      parseInt(flags) <= 255 &&
      ['issue', 'issuewild', 'iodef'].includes(tag) &&
      /^"[^"]*"$/.test(domain)
    );
  }

  private isValidSSHFP(value: string): boolean {
    const parts = value.split(/\s+/);
    if (parts.length !== 3) return false;

    const [algorithm, fptype, fingerprint] = parts;
    return (
      !isNaN(parseInt(algorithm)) && 
      [1, 2, 3, 4].includes(parseInt(algorithm)) &&
      !isNaN(parseInt(fptype)) && 
      [1, 2].includes(parseInt(fptype)) &&
      /^[0-9A-Fa-f]+$/.test(fingerprint)
    );
  }
}

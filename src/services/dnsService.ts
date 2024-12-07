import { ZoneConfig, ZoneOperationResult } from '../types/dns';

export type { ZoneConfig, ZoneOperationResult };

interface SRVRecord {
  priority: number;
  weight: number;
  port: number;
  target: string;
}

interface MXRecord {
  priority: number;
  target: string;
}

type DNSRecordValue = string | string[] | SRVRecord | MXRecord;

interface DNSRecord {
  name: string;
  type: 'A' | 'AAAA' | 'CNAME' | 'MX' | 'TXT' | 'SRV' | 'NS' | 'PTR' | 'CAA' | 'SSHFP' | 'SOA';
  value: DNSRecordValue;
  ttl: number;
  class?: string;
}

export type { DNSRecord, SRVRecord, MXRecord };

// Add error types
export class DNSError extends Error {
  code?: string;
  details?: any;

  constructor(message: string, code?: string, details?: any) {
    super(message);
    this.name = 'DNSError';
    this.code = code;
    this.details = details;
  }
}

class DNSService {
  private baseUrl = process.env.REACT_APP_API_URL || 'http://localhost:3002';

  private createHeaders(keyConfig: ZoneConfig): Headers {
    if (!keyConfig) {
      throw new Error('Missing required DNS configuration');
    }

    // Validate required fields
    const requiredFields = ['server', 'keyName', 'keyValue', 'algorithm'];
    const missingFields = requiredFields.filter(field => !keyConfig[field as keyof ZoneConfig]);

    if (missingFields.length > 0) {
      throw new Error(`Missing required DNS configuration fields: ${missingFields.join(', ')}`);
    }

    const headers = new Headers({
      'Content-Type': 'application/json',
      'x-dns-server': keyConfig.server,
      'x-dns-key-name': keyConfig.keyName,
      'x-dns-key-value': keyConfig.keyValue,
      'x-dns-algorithm': keyConfig.algorithm
    });

    // Add optional key ID if present
    if (keyConfig.id) {
      headers.append('x-dns-key-id', keyConfig.id);
    }

    return headers;
  }

  private formatRecordValue(record: DNSRecord): string {
    switch (record.type) {
      case 'SRV': {
        const srv = this.parseSRVRecord(record.value as (string | SRVRecord));
        return `${srv.priority} ${srv.weight} ${srv.port} ${srv.target}`;
      }
      case 'MX': {
        if (typeof record.value === 'string') {
          const [priority = '10', target = ''] = record.value.split(/\s+/);
          return `${priority} ${target}`;
        } else {
          const mx = record.value as MXRecord;
          return `${mx.priority} ${mx.target}`;
        }
      }
      case 'TXT': {
        if (Array.isArray(record.value)) {
          return record.value.map(v => `"${v.replace(/"/g, '\\"')}"`).join(' ');
        } else if (typeof record.value === 'string') {
          return `"${record.value.replace(/"/g, '\\"')}"`;
        }
        return '""';
      }
      default:
        return String(record.value);
    }
  }

  private parseSRVRecord(value: string | SRVRecord): SRVRecord {
    if (typeof value === 'object' && 'priority' in value) {
      return value;
    }

    if (typeof value !== 'string') {
      throw new Error('Invalid SRV record format');
    }

    const [priority = '0', weight = '0', port = '0', target = ''] = value.split(/\s+/);
    return {
      priority: parseInt(priority, 10),
      weight: parseInt(weight, 10),
      port: parseInt(port, 10),
      target: target
    };
  }

  private prepareRecordForRequest(record: DNSRecord): DNSRecord {
    return {
      ...record,
      class: record.class || 'IN',
      value: this.formatRecordValue(record)
    };
  }

  async fetchZoneRecords(zone: string, keyConfig: ZoneConfig): Promise<DNSRecord[]> {
    try {
      if (!zone) {
        throw new Error('Zone name is required');
      }

      const headers = this.createHeaders(keyConfig);
      const response = await fetch(`${this.baseUrl}/api/zones/${encodeURIComponent(zone)}`, {
        method: 'GET',
        headers,
        credentials: 'include'
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || `Failed to fetch zone records: ${response.statusText}`);
      }

      const data = await response.json();
      return data.records || [];
    } catch (error) {
      console.error('Error fetching zone records:', error);
      throw error instanceof Error ? error : new Error('Failed to fetch zone records');
    }
  }

  async addRecord(zone: string, record: DNSRecord, keyConfig: ZoneConfig): Promise<void> {
    try {
      if (!zone || !record) {
        throw new Error('Zone and record are required');
      }

      if (!keyConfig) {
        throw new Error('Key configuration is required');
      }

      const headers = this.createHeaders(keyConfig);
      const preparedRecord = this.prepareRecordForRequest(record);

      const requestBody = {
        record: preparedRecord,
        keyConfig: {
          server: keyConfig.server,
          keyName: keyConfig.keyName,
          keyValue: keyConfig.keyValue,
          algorithm: keyConfig.algorithm,
          id: keyConfig.id
        }
      };

      console.log('Adding record with data:', {
        zone,
        requestBody: { 
          ...requestBody, 
          keyConfig: { ...requestBody.keyConfig, keyValue: '[REDACTED]' }
        }
      });

      const response = await fetch(`${this.baseUrl}/api/zones/${encodeURIComponent(zone)}/records`, {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: response.statusText }));
        throw new DNSError(
          errorData.error || `Failed to add record: ${response.statusText}`,
          errorData.code,
          errorData.details
        );
      }
    } catch (error) {
      if (error instanceof DNSError) {
        throw error;
      }
      throw new DNSError(
        'Failed to communicate with DNS server',
        'SERVER_ERROR',
        error instanceof Error ? error.message : undefined
      );
    }
  }

  async deleteRecord(zone: string, record: DNSRecord, keyConfig: ZoneConfig): Promise<void> {
    try {
      if (!zone || !record) {
        throw new Error('Zone and record are required');
      }

      if (!keyConfig) {
        throw new Error('Key configuration is required');
      }

      const headers = this.createHeaders(keyConfig);
      const preparedRecord = this.prepareRecordForRequest(record);

      const requestBody = {
        record: preparedRecord,
        keyConfig: {
          server: keyConfig.server,
          keyName: keyConfig.keyName,
          keyValue: keyConfig.keyValue,
          algorithm: keyConfig.algorithm,
          id: keyConfig.id
        }
      };

      console.log('Deleting record with data:', {
        zone,
        requestBody: { 
          ...requestBody, 
          keyConfig: { ...requestBody.keyConfig, keyValue: '[REDACTED]' }
        }
      });

      const response = await fetch(`${this.baseUrl}/api/zones/${encodeURIComponent(zone)}/records`, {
        method: 'DELETE',
        headers,
        credentials: 'include',
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: response.statusText }));
        throw new DNSError(
          errorData.error || `Failed to delete record: ${response.statusText}`,
          errorData.code,
          errorData.details
        );
      }
    } catch (error) {
      if (error instanceof DNSError) {
        throw error;
      }
      throw new DNSError(
        'Failed to communicate with DNS server',
        'SERVER_ERROR',
        error instanceof Error ? error.message : undefined
      );
    }
  }

  async updateRecord(
    zone: string,
    oldRecord: DNSRecord,
    newRecord: DNSRecord,
    keyConfig: ZoneConfig
  ): Promise<void> {
    try {
      if (!zone || !oldRecord || !newRecord) {
        throw new Error('Zone, old record, and new record are required');
      }

      // First delete the old record
      await this.deleteRecord(zone, oldRecord, keyConfig);
      
      // Then add the new record
      await this.addRecord(zone, newRecord, keyConfig);
    } catch (error) {
      if (error instanceof DNSError) {
        throw error;
      }
      throw new DNSError(
        'Failed to communicate with DNS server',
        'SERVER_ERROR',
        error instanceof Error ? error.message : undefined
      );
    }
  }
}

export const dnsService = new DNSService();
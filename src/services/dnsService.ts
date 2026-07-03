// src/services/dnsService.ts
// Frontend DNS service - keys are now stored server-side!

import { ZoneConfig, ZoneOperationResult } from '../types/dns';
import { getApiUrl } from '../utils/apiUrl';

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

/** A single change in an atomic batch. `add`/`delete` use `record`; `update`
 *  uses `oldRecord` + `newRecord`. */
export interface BatchChange {
  op: 'add' | 'delete' | 'update';
  record?: DNSRecord;
  oldRecord?: DNSRecord;
  newRecord?: DNSRecord;
}

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
  private get baseUrl(): string {
    return getApiUrl();
  }

  private createHeaders(): Headers {
    // Keys are now stored server-side - no longer sent in headers!
    return new Headers({
      'Content-Type': 'application/json'
    });
  }

  private formatRecordValue(record: DNSRecord): DNSRecordValue {
    switch (record.type) {
      case 'SOA':
        // SOA records stay as objects - backend will format them
        return record.value;
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
      case 'TXT':
        // Send the raw, unquoted logical value (string) or chunked segments
        // (string[]). The backend adds presentation quoting exactly once when
        // building the nsupdate command; quoting here would double-quote it.
        return record.value;
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

  async fetchZoneRecords(zone: string): Promise<DNSRecord[]> {
    try {
      if (!zone) {
        throw new Error('Zone name is required');
      }

      const headers = this.createHeaders();
      const response = await fetch(`${this.baseUrl}/api/zones/${encodeURIComponent(zone)}`, {
        method: 'GET',
        headers,
        credentials: 'include' // Send authentication cookies
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

  async addRecord(zone: string, record: DNSRecord): Promise<{ warnings?: string[] }> {
    try {
      if (!zone || !record) {
        throw new Error('Zone and record are required');
      }

      const headers = this.createHeaders();
      const preparedRecord = this.prepareRecordForRequest(record);

      const requestBody = {
        record: preparedRecord
      };

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

      const data = await response.json().catch(() => ({}));
      return { warnings: data.warnings };
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

  async deleteRecord(zone: string, record: DNSRecord): Promise<{ warnings?: string[] }> {
    try {
      if (!zone || !record) {
        throw new Error('Zone and record are required');
      }

      const headers = this.createHeaders();
      const preparedRecord = this.prepareRecordForRequest(record);

      const requestBody = {
        record: preparedRecord
      };

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

      const data = await response.json().catch(() => ({}));
      return { warnings: data.warnings };
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
    newRecord: DNSRecord
  ): Promise<{ warnings?: string[] }> {
    try {
      if (!zone || !oldRecord || !newRecord) {
        throw new Error('Zone, old record, and new record are required');
      }

      const headers = this.createHeaders();
      const preparedOldRecord = this.prepareRecordForRequest(oldRecord);
      const preparedNewRecord = this.prepareRecordForRequest(newRecord);

      const requestBody = {
        oldRecord: preparedOldRecord,
        newRecord: preparedNewRecord
      };

      // Use atomic PATCH endpoint instead of separate DELETE and ADD
      const response = await fetch(`${this.baseUrl}/api/zones/${encodeURIComponent(zone)}/records`, {
        method: 'PATCH',
        headers,
        credentials: 'include',
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: response.statusText }));
        throw new DNSError(
          errorData.error || `Failed to update record: ${response.statusText}`,
          errorData.code,
          errorData.details
        );
      }

      const data = await response.json().catch(() => ({}));
      return { warnings: data.warnings };
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

  /**
   * Apply a set of changes to one zone atomically (single backend transaction).
   * Each record is formatted the same way the single-record calls format it.
   */
  async applyBatch(zone: string, changes: BatchChange[]): Promise<{ warnings?: string[] }> {
    try {
      if (!zone || !changes || changes.length === 0) {
        throw new Error('Zone and at least one change are required');
      }

      const prepared = changes.map((c) =>
        c.op === 'update'
          ? {
              op: c.op,
              oldRecord: this.prepareRecordForRequest(c.oldRecord!),
              newRecord: this.prepareRecordForRequest(c.newRecord!),
            }
          : { op: c.op, record: this.prepareRecordForRequest(c.record!) }
      );

      const response = await fetch(`${this.baseUrl}/api/zones/${encodeURIComponent(zone)}/records/batch`, {
        method: 'POST',
        headers: this.createHeaders(),
        credentials: 'include',
        body: JSON.stringify({ changes: prepared }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: response.statusText }));
        throw new DNSError(
          errorData.error || `Failed to apply changes: ${response.statusText}`,
          errorData.code,
          errorData.details
        );
      }

      const data = await response.json().catch(() => ({}));
      return { warnings: data.warnings };
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

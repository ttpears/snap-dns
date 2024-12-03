import { DNSRecord, ZoneConfig, ZoneOperationResult } from '../types/dns';

export type { DNSRecord, ZoneConfig, ZoneOperationResult };

class DNSService {
  private baseUrl = process.env.REACT_APP_API_URL || 'http://localhost:3002';

  async fetchZoneRecords(zone: string, keyConfig: ZoneConfig): Promise<DNSRecord[]> {
    const headers = {
      'Content-Type': 'application/json',
      'x-dns-server': keyConfig.server,
      'x-dns-key-name': keyConfig.keyName,
      'x-dns-key-value': keyConfig.keyValue,
      'x-dns-algorithm': keyConfig.algorithm,
      'x-dns-key-id': keyConfig.id
    };

    const response = await fetch(`${this.baseUrl}/api/zones/${zone}`, {
      method: 'GET',
      headers
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to fetch zone records');
    }

    const data = await response.json();
    return data.records;
  }

  async addRecord(zone: string, record: DNSRecord, keyConfig: ZoneConfig): Promise<void> {
    const response = await fetch(`${this.baseUrl}/api/zones/${zone}/records`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ record, keyConfig })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to add record');
    }
  }

  async deleteRecord(zone: string, record: DNSRecord, keyConfig: ZoneConfig): Promise<void> {
    const response = await fetch(`${this.baseUrl}/api/zones/${zone}/records`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ record, keyConfig })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to delete record');
    }
  }

  async updateRecord(
    zone: string,
    oldRecord: any,
    newRecord: any,
    keyConfig: any
  ): Promise<any> {
    try {
      // First delete the old record
      await this.deleteRecord(zone, oldRecord, keyConfig);
      
      // Then add the new record
      return await this.addRecord(zone, newRecord, keyConfig);
    } catch (error) {
      console.error('Failed to update record:', error);
      throw new Error(`Failed to update record: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

export const dnsService = new DNSService();
import { KeyConfig } from '../config';

export interface DNSRecord {
  name: string;
  type: RecordType;
  value: string;
  ttl: number;
}

export enum RecordType {
  A = 'A',
  AAAA = 'AAAA',
  CNAME = 'CNAME',
  MX = 'MX',
  TXT = 'TXT',
  SRV = 'SRV',
  NS = 'NS',
  PTR = 'PTR',
  CAA = 'CAA',
  SOA = 'SOA',
  SSHFP = 'SSHFP'
}

export interface DNSService {
  addRecord(zone: string, record: DNSRecord, keyConfig: KeyConfig): Promise<void>;
  updateRecord(zone: string, originalRecord: DNSRecord, newRecord: DNSRecord, keyConfig: KeyConfig): Promise<void>;
  deleteRecord(zone: string, record: DNSRecord, keyConfig: KeyConfig): Promise<void>;
  fetchZoneRecords(zone: string, keyConfig: KeyConfig): Promise<DNSRecord[]>;
}

class DNSServiceImpl implements DNSService {
  async addRecord(zone: string, record: DNSRecord, keyConfig: KeyConfig): Promise<void> {
    const response = await fetch(`${process.env.REACT_APP_API_URL}/zone/${zone}/record`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        server: keyConfig.server,
        keyName: keyConfig.keyName,
        keyValue: keyConfig.keyValue,
        algorithm: keyConfig.algorithm,
        record
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to add record');
    }
  }

  async updateRecord(zone: string, originalRecord: DNSRecord, newRecord: DNSRecord, keyConfig: KeyConfig): Promise<void> {
    const response = await fetch(`${process.env.REACT_APP_API_URL}/zone/${zone}/record`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        server: keyConfig.server,
        keyName: keyConfig.keyName,
        keyValue: keyConfig.keyValue,
        algorithm: keyConfig.algorithm,
        originalRecord,
        newRecord
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to update record');
    }
  }

  async deleteRecord(zone: string, record: DNSRecord, keyConfig: KeyConfig): Promise<void> {
    const response = await fetch(`${process.env.REACT_APP_API_URL}/zone/${zone}/record/delete`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        server: keyConfig.server,
        keyName: keyConfig.keyName,
        keyValue: keyConfig.keyValue,
        algorithm: keyConfig.algorithm,
        record
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to delete record');
    }
  }

  async fetchZoneRecords(zone: string, keyConfig: KeyConfig): Promise<DNSRecord[]> {
    const response = await fetch(`${process.env.REACT_APP_API_URL}/zone/${zone}/records`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        server: keyConfig.server,
        keyName: keyConfig.keyName,
        keyValue: keyConfig.keyValue,
        algorithm: keyConfig.algorithm
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to fetch zone records');
    }

    return response.json();
  }
}

export const dnsService = new DNSServiceImpl();
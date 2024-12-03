import { KeyConfig } from '../config';

// Record type enum
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

// Base DNS record interface
export interface DNSRecord {
  name: string;
  type: string;
  value: string | object;
  ttl: number;
  class?: string;
}

// Pending change interface for tracking modifications
export interface PendingChange {
  type: 'ADD' | 'MODIFY' | 'DELETE';
  zone: string;
  keyId: string;
  record?: DNSRecord;
  originalRecord?: DNSRecord;
  newRecord?: DNSRecord;
  name?: string;
  recordType?: RecordType;
  value?: string;
  ttl?: number;
}

// Validation result interface
export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

// DNS operation result
export interface DNSOperationResult {
  success: boolean;
  message: string;
  error?: string;
}

export interface ZoneConfig {
  server: string;
  keyName: string;
  keyValue: string;
  algorithm: string;
  id: string;
}

export interface ZoneOperationResult {
  success: boolean;
  message?: string;
  records?: DNSRecord[];
  error?: string;
}
// Define all DNS-related types for the application
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
  type: RecordType;
  value: string;
  ttl: number;
}

// Pending change interface for tracking modifications
export interface PendingChange {
  type: 'ADD' | 'MODIFY' | 'DELETE';
  zone: string;
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

// Zone transfer response
export interface ZoneTransferResponse {
  records: DNSRecord[];
  error?: string;
}

// DNS operation result
export interface DNSOperationResult {
  success: boolean;
  message: string;
  error?: string;
}
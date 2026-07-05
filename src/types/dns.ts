// src/types/dns.ts

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
  SSHFP = 'SSHFP',
  // Additional types managed as opaque presentation-format values (RFC 3597
  // style): DNSSEC delegation/keys, DANE, service binding, redirect, etc.
  DS = 'DS',
  DNSKEY = 'DNSKEY',
  CDS = 'CDS',
  CDNSKEY = 'CDNSKEY',
  TLSA = 'TLSA',
  SMIMEA = 'SMIMEA',
  NAPTR = 'NAPTR',
  SVCB = 'SVCB',
  HTTPS = 'HTTPS',
  DNAME = 'DNAME',
  LOC = 'LOC',
  CERT = 'CERT',
  URI = 'URI',
  KX = 'KX'
}

// Base DNS record interface
export interface DNSRecord {
  name: string;
  // A RecordType mnemonic (A, MX, ...) or an RFC 3597 unknown-type token
  // ("TYPE<1-65535>", whose value uses the generic "\# <length> <hex>" form).
  type: string;
  value: string | object;
  ttl: number;
  class?: string;
}

// Pending change interface for tracking modifications
export interface PendingChange {
  // Unique id stamped by PendingChangesContext.addPendingChange; required so
  // individual changes can be removed without affecting others.
  id: string;
  type: 'ADD' | 'MODIFY' | 'DELETE' | 'RESTORE';
  zone: string;
  keyId: string;
  record?: DNSRecord;
  originalRecord?: DNSRecord;
  newRecord?: DNSRecord;
  name?: string;
  recordType?: RecordType;
  value?: string;
  ttl?: number;
  // Provenance for changes queued from a snapshot restore
  source?: {
    type: string;
    id: string | number;
    timestamp: number;
  };
}

// Input shape for queueing a change — id is assigned by the context.
export type NewPendingChange = Omit<PendingChange, 'id'> & { id?: string };

export interface ZoneOperationResult {
  success: boolean;
  message?: string;
  records?: DNSRecord[];
  error?: string;
}
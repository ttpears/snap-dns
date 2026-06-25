// backend/src/types/dns.ts
export interface DNSRecord {
  name: string;
  type: string;
  value: string | string[] | Record<string, unknown>;
  ttl: number;
  class?: string;
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
  message: string;
} 
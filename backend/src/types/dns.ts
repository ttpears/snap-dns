export interface DNSRecord {
  name: string;
  type: string;
  value: string | any;
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
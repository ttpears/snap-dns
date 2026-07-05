// backend/src/types/dns.ts
export interface DNSRecord {
  name: string;
  // A registered type mnemonic (A, MX, ...) or an RFC 3597 unknown-type token
  // ("TYPE<1-65535>", whose value uses the generic "\# <length> <hex>" form).
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
export interface DNSKey {
  id: string;
  name: string;
  secret: string;
  algorithm: string;
  server: string;
  zones: string[];
}

export interface KeyOperationResult {
  success: boolean;
  message?: string;
  key?: DNSKey;
  error?: string;
} 
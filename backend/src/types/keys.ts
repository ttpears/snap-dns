export interface Key {
  id: string;
  name: string;
  algorithm: string;
  secret: string;
  server: string;
}

export interface DNSKey extends Key {
  zones?: string[];
}

export interface KeyOperationResult {
  success: boolean;
  message?: string;
  key?: Key;
  error?: string;
} 
// shared-types/keys.ts
// Shared TSIG key type definitions

// Base key interface
export interface Key {
  id: string;
  name: string;
  algorithm: string;
  secret: string;
  server: string;
  zones: string[];
  created?: number;
}

// DNS key interface (extends Key)
export interface DNSKey extends Omit<Key, 'zones'> {
  zones?: string[];
}

// Key configuration (legacy - same as Key but created is required)
export interface KeyConfig {
  id: string;
  name: string;
  algorithm: string;
  secret: string;
  server: string;
  zones: string[];
  created: number;
}

// Key operation result
export interface KeyOperationResult {
  success: boolean;
  message?: string;
  key?: Key;
  error?: string;
}

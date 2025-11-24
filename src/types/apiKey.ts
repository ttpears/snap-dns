// src/types/apiKey.ts

/**
 * Scopes that can be assigned to an API key
 */
export enum ApiKeyScope {
  /** View zones and records */
  READ = 'read',
  /** Modify DNS records */
  WRITE = 'write',
  /** Manage keys, users, and system settings */
  ADMIN = 'admin'
}

/**
 * API Key metadata (without sensitive data)
 * Displayed in the UI
 */
export interface ApiKeyResponse {
  /** Unique identifier for the key */
  id: string;
  /** Human-readable name for the key */
  name: string;
  /** Scopes granted to this key */
  scopes: ApiKeyScope[];
  /** When the key was created */
  createdAt: Date;
  /** Last time the key was used */
  lastUsedAt?: Date;
  /** When the key expires (null = never) */
  expiresAt?: Date;
  /** Preview of the key (first 12 chars only) */
  keyPreview: string;
}

/**
 * Response when creating a new API key
 * The plain key is only returned once at creation
 */
export interface ApiKeyCreateResponse {
  /** The plain text API key - shown only once! */
  key: string;
  /** Metadata about the created key */
  metadata: ApiKeyResponse;
}

/**
 * Data required to create a new API key
 */
export interface ApiKeyCreateData {
  /** Human-readable name for the key */
  name: string;
  /** Scopes to grant to this key */
  scopes: ApiKeyScope[];
  /** Number of days until expiration (optional, null = never expires) */
  expiresInDays?: number;
}

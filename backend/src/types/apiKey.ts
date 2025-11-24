// backend/src/types/apiKey.ts

/**
 * Scopes that can be assigned to an API key
 * Keys inherit user permissions but can be further restricted by scopes
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
 * API Key stored in the system
 * The keyHash is bcrypt-hashed and never exposed
 */
export interface ApiKey {
  /** Unique identifier for the key */
  id: string;
  /** User ID that owns this key */
  userId: string;
  /** Human-readable name for the key */
  name: string;
  /** Bcrypt hash of the API key */
  keyHash: string;
  /** Scopes granted to this key */
  scopes: ApiKeyScope[];
  /** When the key was created */
  createdAt: Date;
  /** Last time the key was used */
  lastUsedAt?: Date;
  /** When the key expires (null = never) */
  expiresAt?: Date;
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

/**
 * API Key response (without sensitive data)
 * Returned to clients when listing keys
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
 * Validated API key with associated user data
 * Attached to requests after successful authentication
 */
export interface ValidatedApiKey {
  /** The API key record */
  key: ApiKey;
  /** User ID that owns this key */
  userId: string;
  /** Username for audit logging */
  username: string;
  /** User's role */
  role: string;
  /** User's allowed key IDs */
  allowedKeyIds: string[];
}

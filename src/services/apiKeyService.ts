// src/services/apiKeyService.ts
import { ApiKeyResponse, ApiKeyCreateResponse, ApiKeyCreateData } from '../types/apiKey';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3002';

/**
 * Create a new API key
 */
export async function createApiKey(data: ApiKeyCreateData): Promise<ApiKeyCreateResponse> {
  const response = await fetch(`${API_URL}/api/api-keys`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    credentials: 'include',
    body: JSON.stringify(data)
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to create API key');
  }

  const result = await response.json();

  // Convert date strings to Date objects
  if (result.data.metadata.createdAt) {
    result.data.metadata.createdAt = new Date(result.data.metadata.createdAt);
  }
  if (result.data.metadata.lastUsedAt) {
    result.data.metadata.lastUsedAt = new Date(result.data.metadata.lastUsedAt);
  }
  if (result.data.metadata.expiresAt) {
    result.data.metadata.expiresAt = new Date(result.data.metadata.expiresAt);
  }

  return result.data;
}

/**
 * List all API keys for the current user
 */
export async function listApiKeys(): Promise<ApiKeyResponse[]> {
  const response = await fetch(`${API_URL}/api/api-keys`, {
    method: 'GET',
    credentials: 'include'
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to list API keys');
  }

  const result = await response.json();

  // Convert date strings to Date objects
  const keys = result.data.map((key: any) => ({
    ...key,
    createdAt: new Date(key.createdAt),
    lastUsedAt: key.lastUsedAt ? new Date(key.lastUsedAt) : undefined,
    expiresAt: key.expiresAt ? new Date(key.expiresAt) : undefined
  }));

  return keys;
}

/**
 * Delete an API key
 */
export async function deleteApiKey(keyId: string): Promise<void> {
  const response = await fetch(`${API_URL}/api/api-keys/${keyId}`, {
    method: 'DELETE',
    credentials: 'include'
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to delete API key');
  }
}

/**
 * Rotate an API key (generate new key value, keep same metadata)
 */
export async function rotateApiKey(keyId: string): Promise<ApiKeyCreateResponse> {
  const response = await fetch(`${API_URL}/api/api-keys/${keyId}/rotate`, {
    method: 'POST',
    credentials: 'include'
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to rotate API key');
  }

  const result = await response.json();

  // Convert date strings to Date objects
  if (result.data.metadata.createdAt) {
    result.data.metadata.createdAt = new Date(result.data.metadata.createdAt);
  }
  if (result.data.metadata.lastUsedAt) {
    result.data.metadata.lastUsedAt = new Date(result.data.metadata.lastUsedAt);
  }
  if (result.data.metadata.expiresAt) {
    result.data.metadata.expiresAt = new Date(result.data.metadata.expiresAt);
  }

  return result.data;
}
